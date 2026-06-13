// Adaptador de Persistência na Nuvem: Firebase Firestore (firebase.js)

class FirebaseAdapter {
  constructor() {
    this.db = null;
    this.app = null;
    this.auth = null;
    this.storage = null;
    this.configured = false;
  }

  // Configura a conexão com o Firebase usando as chaves fornecidas
  configure(config) {
    try {
      if (!window.firebase) {
        throw new Error('SDK do Firebase não carregado no navegador.');
      }

      if (this.app) {
        // Se já houver um app inicializado, deleta antes de reconfigurar
        this.app.delete();
      }

      this.app = window.firebase.initializeApp(config, 'RaizesApp');
      this.db = window.firebase.firestore(this.app);
      // Inicializa o Authentication (se o SDK estiver carregado)
      try {
        if (window.firebase.auth) {
          this.auth = window.firebase.auth(this.app);
        }
      } catch (e) {
        console.warn('Firebase Auth não pôde ser inicializado:', e);
      }
      // Inicializa o Storage (fotos), se o SDK estiver carregado
      try {
        if (window.firebase.storage) {
          this.storage = window.firebase.storage(this.app);
        }
      } catch (e) {
        console.warn('Firebase Storage não pôde ser inicializado:', e);
      }
      this.configured = true;

      // Persiste as chaves no localStorage para reconexão automática
      localStorage.setItem('raizes_firebase_config', JSON.stringify(config));
      localStorage.setItem('raizes_db_type', 'firebase');

      return true;
    } catch (err) {
      this.configured = false;
      throw new Error(`Erro ao configurar Firebase: ${err.message}`);
    }
  }

  isConfigured() {
    return this.configured && this.db !== null;
  }

  disconnect() {
    this.db = null;
    this.auth = null;
    this.storage = null;
    if (this.app) {
      try { this.app.delete(); } catch(e){}
      this.app = null;
    }
    this.configured = false;
    localStorage.removeItem('raizes_firebase_config');
    localStorage.setItem('raizes_db_type', 'local');
  }

  // ======================= AUTENTICAÇÃO (login real) =======================
  hasAuth() {
    return !!this.auth;
  }

  // Assina mudanças no estado de autenticação. Retorna a função de cancelamento.
  onAuthChange(callback) {
    if (!this.auth) {
      // Sem Auth disponível: informa "deslogado" uma vez para o app seguir o fluxo.
      callback(null);
      return () => {};
    }
    return this.auth.onAuthStateChanged(callback);
  }

  async signInGoogle() {
    if (!this.auth) throw new Error('Autenticação indisponível.');
    const provider = new window.firebase.auth.GoogleAuthProvider();
    const result = await this.auth.signInWithPopup(provider);
    return result.user;
  }

  async signInEmail(email, senha) {
    if (!this.auth) throw new Error('Autenticação indisponível.');
    const result = await this.auth.signInWithEmailAndPassword(email, senha);
    return result.user;
  }

  async registerEmail(nome, email, senha) {
    if (!this.auth) throw new Error('Autenticação indisponível.');
    const result = await this.auth.createUserWithEmailAndPassword(email, senha);
    if (nome && result.user) {
      try { await result.user.updateProfile({ displayName: nome }); } catch (e) { /* nome opcional */ }
    }
    return result.user;
  }

  async signOutUser() {
    if (this.auth) {
      try { await this.auth.signOut(); } catch (e) { /* ignora */ }
    }
  }

  // ======================= REGISTRO DE ATIVIDADES =======================
  // Grava uma entrada de auditoria. Best-effort: falha de log nunca quebra a ação.
  async logAudit(entry) {
    if (!this.isConfigured()) return;
    try {
      await this.db.collection('raizes_audit').add({
        familyId: entry.familyId || null,
        userId: entry.userId || null,
        userName: entry.userName || 'Desconhecido',
        action: entry.action || '',
        targetId: entry.targetId || null,
        targetName: entry.targetName || '',
        details: entry.details || '',
        at: window.firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.warn('Falha ao registrar atividade:', err);
    }
  }

  // Carrega o histórico de uma família, ordenado do mais recente para o mais antigo.
  // Ordena no cliente para não exigir índice composto (where + orderBy) no Firestore.
  async loadAudit(familyId, max = 200) {
    if (!this.isConfigured()) return [];
    try {
      const snap = await this.db.collection('raizes_audit').where('familyId', '==', familyId).get();
      const rows = [];
      snap.forEach(doc => {
        const d = doc.data();
        const at = d.at && d.at.toMillis ? d.at.toMillis() : 0;
        rows.push({
          id: doc.id,
          userId: d.userId,
          userName: d.userName,
          action: d.action,
          targetId: d.targetId,
          targetName: d.targetName,
          details: d.details,
          at
        });
      });
      rows.sort((a, b) => b.at - a.at);
      return rows.slice(0, max);
    } catch (err) {
      console.warn('Falha ao carregar histórico:', err);
      return [];
    }
  }

  // ======================= ACESSO / MEMBERSHIP POR FAMÍLIA =======================
  // Cada família tem memberUserIds (UIDs com acesso) e blockedUserIds (banidos).
  // Toda escrita aqui é ADITIVA (arrayUnion/arrayRemove) — nunca sobrescreve a
  // lista inteira, para não apagar membros já existentes na nuvem.

  // Índice público código→família: permite localizar a família pelo código
  // (o código é o "segredo" compartilhado) para então entrar nela.
  async _writeFamilyIndex(familyData) {
    if (!familyData.code) return;
    const ref = this.db.collection('raizes_family_index').doc(String(familyData.code).toUpperCase());
    await ref.set({
      code: String(familyData.code).toUpperCase(),
      familyId: familyData.id,
      name: familyData.name || '',
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // Garante o documento de acesso da família: backfill idempotente de
  // memberUserIds a partir do dono e de quem vinculou conta, + índice por código.
  // Best-effort: nunca quebra o fluxo principal de sincronização.
  async _ensureFamilyAccessDoc(familyData) {
    try {
      const uids = [];
      if (familyData.ownerUserId) uids.push(familyData.ownerUserId);
      (familyData.memberUserIds || []).forEach(u => uids.push(u));
      (familyData.members || []).forEach(m => { if (m.linkedUserId) uids.push(m.linkedUserId); });
      const uniq = [...new Set(uids.filter(Boolean))];
      if (uniq.length) {
        await this.db.collection('raizes_families').doc(familyData.id).set(
          { memberUserIds: window.firebase.firestore.FieldValue.arrayUnion(...uniq) },
          { merge: true }
        );
      }
      await this._writeFamilyIndex(familyData);
    } catch (err) {
      console.warn('Falha ao garantir acesso da família (best-effort):', err);
    }
  }

  // Adiciona um UID aos membros de uma família (aditivo).
  async ensureMembership(familyId, uid) {
    if (!this.isConfigured() || !uid) return;
    await this.db.collection('raizes_families').doc(familyId).set(
      { memberUserIds: window.firebase.firestore.FieldValue.arrayUnion(uid) },
      { merge: true }
    );
  }

  // Localiza os metadados de uma família pelo código (via índice público).
  async findFamilyMetaByCode(code) {
    if (!this.isConfigured() || !code) return null;
    const idxSnap = await this.db.collection('raizes_family_index').doc(String(code).toUpperCase()).get();
    if (!idxSnap.exists) return null;
    const familyId = idxSnap.data().familyId;
    const famSnap = await this.db.collection('raizes_families').doc(familyId).get();
    if (!famSnap.exists) return null;
    return famSnap.data();
  }

  // Entra numa família pelo código: recusa se o usuário estiver bloqueado.
  // Retorna o familyId em caso de sucesso.
  async joinFamilyByCode(code, uid) {
    const meta = await this.findFamilyMetaByCode(code);
    if (!meta) throw new Error('Código inválido ou família não encontrada.');
    const blocked = Array.isArray(meta.blockedUserIds) ? meta.blockedUserIds : [];
    if (uid && blocked.includes(uid)) {
      throw new Error('Seu acesso a esta família foi bloqueado pelo administrador.');
    }
    await this.ensureMembership(meta.id, uid);
    return meta.id;
  }

  // (Dono) Bloqueia um usuário: tira dos membros e adiciona aos bloqueados.
  async blockUser(familyId, uid) {
    if (!this.isConfigured() || !uid) return;
    await this.db.collection('raizes_families').doc(familyId).set({
      memberUserIds: window.firebase.firestore.FieldValue.arrayRemove(uid),
      blockedUserIds: window.firebase.firestore.FieldValue.arrayUnion(uid)
    }, { merge: true });
  }

  // (Dono) Desbloqueia um usuário (não o readiciona; ele precisa entrar de novo).
  async unblockUser(familyId, uid) {
    if (!this.isConfigured() || !uid) return;
    await this.db.collection('raizes_families').doc(familyId).set(
      { blockedUserIds: window.firebase.firestore.FieldValue.arrayRemove(uid) },
      { merge: true }
    );
  }

  // (Dono) Exclui a família inteira da nuvem: membros, auditoria, índice e a família.
  async deleteFamily(familyId, code) {
    if (!this.isConfigured()) return;
    const flush = async (snap) => {
      let batch = this.db.batch(); let n = 0;
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        if (++n >= 400) { await batch.commit(); batch = this.db.batch(); n = 0; }
      }
      if (n > 0) await batch.commit();
    };
    const memSnap = await this.db.collection('raizes_members').where('familyId', '==', familyId).get();
    await flush(memSnap);
    try {
      const audSnap = await this.db.collection('raizes_audit').where('familyId', '==', familyId).get();
      await flush(audSnap);
    } catch (e) { /* auditoria pode não existir */ }
    if (code) {
      try { await this.db.collection('raizes_family_index').doc(String(code).toUpperCase()).delete(); } catch (e) {}
    }
    await this.db.collection('raizes_families').doc(familyId).delete();
  }

  // ======================= FOTOS (Firebase Storage) =======================
  hasStorage() {
    return !!this.storage;
  }

  // Sobe uma foto (data URL base64) para o Storage e devolve a URL pública de
  // download. Guardar a URL (e não o base64) mantém os documentos do Firestore
  // pequenos e não estoura o limite do localStorage.
  async uploadPhoto(familyId, dataUrl) {
    if (!this.storage) throw new Error('Armazenamento de fotos indisponível.');
    if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('Imagem inválida.');
    const photoId = 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const path = `families/${familyId || 'sem-familia'}/photos/${photoId}.webp`;
    const ref = this.storage.ref(path);
    const blob = await (await fetch(dataUrl)).blob();
    const snap = await ref.put(blob, { contentType: blob.type || 'image/webp' });
    return await snap.ref.getDownloadURL();
  }

  // Remove uma foto do Storage a partir da sua URL de download (best-effort).
  async deletePhotoByUrl(url) {
    if (!this.storage || !url) return;
    try {
      await this.storage.refFromURL(url).delete();
    } catch (e) {
      // Foto inexistente / URL externa: ignora silenciosamente.
    }
  }

  // Tenta reconectar automaticamente usando os dados salvos
  autoConnect() {
    const savedConfig = localStorage.getItem('raizes_firebase_config');
    if (savedConfig) {
      try {
        this.configure(JSON.parse(savedConfig));
        localStorage.setItem('raizes_db_type', 'firebase');
        return true;
      } catch (err) {
        console.warn('Falha na reconexão automática ao Firebase:', err);
        this.disconnect();
      }
    }
    return false;
  }

  // Monta o documento de um membro para o Firestore
  _memberDoc(member, familyId) {
    return {
      id: member.id,
      familyId: familyId,
      name: member.name,
      birthDate: member.birthDate || '',
      deathDate: member.deathDate || '',
      status: member.status || 'vivo',
      bio: member.bio || '',
      photo: member.photo || '',
      role: member.role || '',
      parentId: member.parentId || null,
      parentId2: member.parentId2 || null,
      partnerId: member.partnerId || null,
      childrenIds: member.childrenIds || [],
      memberType: member.memberType || 'offline',
      linkedUserId: member.linkedUserId || null,
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    };
  }

  // Sincronização INCREMENTAL: grava apenas os membros alterados (e remove os excluídos),
  // em vez de reescrever a família inteira. Reduz drasticamente o uso da cota do Firestore.
  async syncFamilyMembers(familyData, changedIds = [], deletedIds = []) {
    if (!this.isConfigured()) return;

    const batch = this.db.batch();

    // Atualiza os metadados da família (1 escrita pequena)
    const familyRef = this.db.collection('raizes_families').doc(familyData.id);
    batch.set(familyRef, {
      id: familyData.id,
      name: familyData.name,
      code: familyData.code,
      rootMemberId: familyData.rootMemberId,
      ownerName: familyData.ownerName || '',
      ownerPhoto: familyData.ownerPhoto || '',
      ownerUserId: familyData.ownerUserId || null,
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const memberById = new Map((familyData.members || []).map(m => [m.id, m]));
    const uniqueChanged = [...new Set(changedIds)];

    uniqueChanged.forEach(id => {
      const member = memberById.get(id);
      if (!member) return;
      const memberRef = this.db.collection('raizes_members').doc(id);
      batch.set(memberRef, this._memberDoc(member, familyData.id), { merge: true });
    });

    [...new Set(deletedIds)].forEach(id => {
      batch.delete(this.db.collection('raizes_members').doc(id));
    });

    await batch.commit();
    await this._ensureFamilyAccessDoc(familyData);
  }

  // Sincroniza (Upsert) uma família no Firestore
  async syncFamily(familyData) {
    if (!this.isConfigured()) return;

    try {
      const familyRef = this.db.collection('raizes_families').doc(familyData.id);
      const familyDoc = {
        id: familyData.id,
        name: familyData.name,
        code: familyData.code,
        rootMemberId: familyData.rootMemberId,
        ownerName: familyData.ownerName || '',
        ownerPhoto: familyData.ownerPhoto || '',
        ownerUserId: familyData.ownerUserId || null,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      };

      await familyRef.set(familyDoc, { merge: true });

      // Salva os membros em uma subcoleção ou coleção separada
      if (familyData.members && Array.isArray(familyData.members)) {
        const batch = this.db.batch();

        // 1. Busca membros existentes no Firestore para esta família e remove os que foram excluídos localmente
        const existingMembersSnapshot = await this.db.collection('raizes_members').where('familyId', '==', familyData.id).get();
        const currentMemberIds = new Set(familyData.members.map(m => m.id));
        existingMembersSnapshot.forEach(doc => {
          if (!currentMemberIds.has(doc.id)) {
            batch.delete(doc.ref);
          }
        });

        // 2. Atualiza/insere os membros atuais
        for (const member of familyData.members) {
          const memberRef = this.db.collection('raizes_members').doc(member.id);
          const memberDoc = {
            id: member.id,
            familyId: familyData.id,
            name: member.name,
            birthDate: member.birthDate || '',
            deathDate: member.deathDate || '',
            status: member.status || 'vivo',
            bio: member.bio || '',
            photo: member.photo || '',
            role: member.role || '',
            parentId: member.parentId || null,
            parentId2: member.parentId2 || null,
            partnerId: member.partnerId || null,
            childrenIds: member.childrenIds || [],
            memberType: member.memberType || 'offline',
            linkedUserId: member.linkedUserId || null,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
          };
          batch.set(memberRef, memberDoc, { merge: true });
        }
        await batch.commit();
      }
      await this._ensureFamilyAccessDoc(familyData);
    } catch (err) {
      console.error('Erro ao sincronizar família no Firebase:', err);
      throw err;
    }
  }

  // Monta o objeto família a partir do doc do Firestore + seus membros.
  _hydrateFamily(f, members) {
    return {
      id: f.id,
      name: f.name,
      code: f.code,
      rootMemberId: f.rootMemberId,
      ownerName: f.ownerName,
      ownerPhoto: f.ownerPhoto,
      ownerUserId: f.ownerUserId || null,
      memberUserIds: Array.isArray(f.memberUserIds) ? f.memberUserIds : [],
      blockedUserIds: Array.isArray(f.blockedUserIds) ? f.blockedUserIds : [],
      members: members || []
    };
  }

  _hydrateMember(m) {
    return {
      id: m.id,
      name: m.name,
      birthDate: m.birthDate,
      deathDate: m.deathDate,
      status: m.status,
      bio: m.bio,
      photo: m.photo,
      role: m.role,
      parentId: m.parentId,
      parentId2: m.parentId2 || null,
      partnerId: m.partnerId,
      childrenIds: Array.isArray(m.childrenIds) ? m.childrenIds : [],
      memberType: m.memberType,
      linkedUserId: m.linkedUserId || null
    };
  }

  // Carrega APENAS as famílias do usuário: aquelas onde ele é membro OU é o dono
  // (a inclusão do dono garante o bootstrap de famílias antigas ainda sem
  // memberUserIds populado). Cada família carrega só os seus próprios membros.
  async loadMyFamilies(uid) {
    if (!this.isConfigured()) return [];
    try {
      const famCol = this.db.collection('raizes_families');
      const queries = [];
      if (uid) {
        queries.push(famCol.where('memberUserIds', 'array-contains', uid).get());
        queries.push(famCol.where('ownerUserId', '==', uid).get());
      }
      if (queries.length === 0) return [];

      const snaps = await Promise.all(queries);
      const famById = new Map();
      snaps.forEach(snap => snap.forEach(doc => famById.set(doc.id, doc.data())));
      if (famById.size === 0) return [];

      const families = [];
      for (const f of famById.values()) {
        const memSnap = await this.db.collection('raizes_members').where('familyId', '==', f.id).get();
        const members = [];
        memSnap.forEach(doc => members.push(this._hydrateMember(doc.data())));
        families.push(this._hydrateFamily(f, members));
      }
      return families;
    } catch (err) {
      console.error('Erro ao carregar famílias do Firebase:', err);
      throw err;
    }
  }

  // Compatibilidade: o carregamento agora é sempre escopado ao usuário.
  async loadAllFamilies(uid) {
    return this.loadMyFamilies(uid);
  }
}

const firebaseAdapterInstance = new FirebaseAdapter();
export default firebaseAdapterInstance;
