// Adaptador de Persistência na Nuvem: Firebase Firestore (firebase.js)

class FirebaseAdapter {
  constructor() {
    this.db = null;
    this.app = null;
    this.auth = null;
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
    } catch (err) {
      console.error('Erro ao sincronizar família no Firebase:', err);
      throw err;
    }
  }

  // Carrega todas as famílias e membros do Firestore
  async loadAllFamilies() {
    if (!this.isConfigured()) return [];

    try {
      const familiesSnapshot = await this.db.collection('raizes_families').get();
      const membersSnapshot = await this.db.collection('raizes_members').get();

      const membersByFamily = {};
      membersSnapshot.forEach(doc => {
        const m = doc.data();
        if (!membersByFamily[m.familyId]) {
          membersByFamily[m.familyId] = [];
        }
        membersByFamily[m.familyId].push({
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
        });
      });

      const families = [];
      familiesSnapshot.forEach(doc => {
        const f = doc.data();
        families.push({
          id: f.id,
          name: f.name,
          code: f.code,
          rootMemberId: f.rootMemberId,
          ownerName: f.ownerName,
          ownerPhoto: f.ownerPhoto,
          ownerUserId: f.ownerUserId || null,
          members: membersByFamily[f.id] || []
        });
      });

      return families;
    } catch (err) {
      console.error('Erro ao carregar famílias do Firebase:', err);
      throw err;
    }
  }
}

const firebaseAdapterInstance = new FirebaseAdapter();
export default firebaseAdapterInstance;
