// Adaptador de Persistência na Nuvem: Firebase Firestore (firebase.js)

class FirebaseAdapter {
  constructor() {
    this.db = null;
    this.app = null;
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
    if (this.app) {
      try { this.app.delete(); } catch(e){}
      this.app = null;
    }
    this.configured = false;
    localStorage.removeItem('raizes_firebase_config');
    localStorage.setItem('raizes_db_type', 'local');
  }

  // Tenta reconectar automaticamente usando os dados salvos
  autoConnect() {
    const savedConfig = localStorage.getItem('raizes_firebase_config');
    const dbType = localStorage.getItem('raizes_db_type');
    if (savedConfig && dbType === 'firebase') {
      try {
        this.configure(JSON.parse(savedConfig));
        return true;
      } catch (err) {
        console.warn('Falha na reconexão automática ao Firebase:', err);
        this.disconnect();
      }
    }
    return false;
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
            partnerId: member.partnerId || null,
            childrenIds: member.childrenIds || [],
            memberType: member.memberType || 'offline',
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
          partnerId: m.partnerId,
          childrenIds: m.childrenIds || [],
          memberType: m.memberType
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
