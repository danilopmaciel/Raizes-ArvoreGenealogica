// Módulo de Gerenciamento de Armazenamento (LocalStorage), Dados Demo e Sincronização Supabase

import supabaseAdapterInstance from './supabase.js?v=20260605_02';
import firebaseAdapterInstance from './firebase.js?v=20260605_02';

const DEFAULT_SILHOUETTE = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22%2394a3b8%22%3E%3Cpath%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E';

const STORAGE_KEY_USER = 'raizes_current_user';
const STORAGE_KEY_FAMILIES = 'raizes_families';
const STORAGE_KEY_ACTIVE_FAMILY = 'raizes_active_family_id';

// Estrutura de Dados de Demonstração Rica
const DEMO_FAMILY = {
  id: 'fam_demo_2026',
  name: 'Família Silva & Santos',
  code: 'RAIZ-DEMO-2026',
  rootMemberId: 'mem_demo_root',
  members: [
    {
      id: 'mem_demo_avo_m',
      name: 'Antônio Silva',
      birthDate: '1945-03-12',
      photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      role: 'Avô',
      parentId: null,
      partnerId: 'mem_demo_avo_f',
      childrenIds: ['mem_demo_root', 'mem_demo_tio'],
      bio: 'Patriarca da família Silva, apaixonado por marcenaria e histórias antigas.'
    },
    {
      id: 'mem_demo_avo_f',
      name: 'Maria Helena Silva',
      birthDate: '1948-07-25',
      photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
      role: 'Avó',
      parentId: null,
      partnerId: 'mem_demo_avo_m',
      childrenIds: ['mem_demo_root', 'mem_demo_tio'],
      bio: 'Matriarca, famosa por suas receitas tradicionais e reuniões de domingo.'
    },
    {
      id: 'mem_demo_root',
      name: 'Carlos Eduardo Silva',
      birthDate: '1975-10-15',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      role: 'Raiz / Pai',
      parentId: 'mem_demo_avo_m',
      partnerId: 'mem_demo_mae',
      childrenIds: ['mem_demo_filho1', 'mem_demo_filha2'],
      bio: 'Engenheiro de software e entusiasta de genealogia. Iniciou esta árvore.'
    },
    {
      id: 'mem_demo_mae',
      name: 'Ana Lúcia Santos Silva',
      birthDate: '1978-02-20',
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      role: 'Mãe / Cônjuge',
      parentId: null,
      partnerId: 'mem_demo_root',
      childrenIds: ['mem_demo_filho1', 'mem_demo_filha2'],
      bio: 'Arquiteta e designer de interiores, trouxe muita arte para a família.'
    },
    {
      id: 'mem_demo_tio',
      name: 'Roberto Silva',
      birthDate: '1980-05-10',
      photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      role: 'Tio',
      parentId: 'mem_demo_avo_m',
      partnerId: null,
      childrenIds: [],
      bio: 'Fotógrafo profissional de natureza e viajante inveterado.'
    },
    {
      id: 'mem_demo_filho1',
      name: 'Lucas Santos Silva',
      birthDate: '2005-04-18',
      photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
      role: 'Filho',
      parentId: 'mem_demo_root',
      partnerId: null,
      childrenIds: [],
      bio: 'Estudante de Ciência da Computação, adora jogos e tecnologia.'
    },
    {
      id: 'mem_demo_filha2',
      name: 'Beatriz Santos Silva',
      birthDate: '2008-11-30',
      photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
      role: 'Filha',
      parentId: 'mem_demo_root',
      partnerId: null,
      childrenIds: [],
      bio: 'Atleta de natação e apaixonada por literatura clássica.'
    }
  ],
  subFamilies: []
};

class StorageManager {
  static getCurrentUser() {
    const userStr = localStorage.getItem(STORAGE_KEY_USER);
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    if (user && user.photo && (user.photo.includes('unsplash.com') || user.photo.includes('<svg'))) {
      user.photo = DEFAULT_SILHOUETTE;
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    }
    return user;
  }

  static setCurrentUser(user) {
    if (user) {
      if (user.photo && (user.photo.includes('unsplash.com') || user.photo.includes('<svg'))) {
        user.photo = DEFAULT_SILHOUETTE;
      }
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  }

  static getFamilies() {
    const familiesStr = localStorage.getItem(STORAGE_KEY_FAMILIES);
    if (!familiesStr) return [];
    const families = JSON.parse(familiesStr);
    let modified = false;
    families.forEach(f => {
      if (f && f.members) {
        f.members.forEach(m => {
          if (m.photo && (m.photo.includes('unsplash.com') || m.photo.includes('<svg'))) {
            m.photo = DEFAULT_SILHOUETTE;
            modified = true;
          }
        });
      }
    });
    if (modified) {
      localStorage.setItem(STORAGE_KEY_FAMILIES, JSON.stringify(families));
    }
    return families;
  }

  static saveFamilies(families) {
    localStorage.setItem(STORAGE_KEY_FAMILIES, JSON.stringify(families));
    families.forEach(f => this._cloudSyncFamily(f));
  }

  // --- Controle de alterações ainda não sincronizadas com a nuvem (pendências) ---
  static _getDirty() {
    try {
      return JSON.parse(localStorage.getItem('raizes_dirty_families') || '[]');
    } catch (e) {
      return [];
    }
  }

  static _markDirty(familyId) {
    const dirty = this._getDirty();
    if (!dirty.includes(familyId)) {
      dirty.push(familyId);
      localStorage.setItem('raizes_dirty_families', JSON.stringify(dirty));
    }
  }

  static _clearDirty(familyId) {
    const dirty = this._getDirty().filter(id => id !== familyId);
    localStorage.setItem('raizes_dirty_families', JSON.stringify(dirty));
  }

  static _notifyCloudError(err) {
    try {
      window.dispatchEvent(new CustomEvent('raizes-cloud-error', {
        detail: { message: (err && err.message) || 'desconhecido' }
      }));
    } catch (e) { /* ambiente sem window */ }
  }

  // Sincroniza UMA família na nuvem.
  // - opts.changedMemberIds / opts.deletedMemberIds => escrita INCREMENTAL (só o que mudou)
  // - sem opts => sincronização completa (usada em operações estruturais raras)
  // Marca a família como pendente até a nuvem confirmar, para não perder a
  // alteração local caso a gravação falhe (ex.: cota do banco esgotada).
  static _cloudSyncFamily(family, opts = {}) {
    const hasSupa = supabaseAdapterInstance.isConfigured();
    const hasFire = firebaseAdapterInstance.isConfigured();
    // Sem nuvem configurada NESTE instante (pode ser uma chamada transitória antes
    // do Firebase terminar de configurar): apenas retorna. NÃO limpa a pendência,
    // senão uma alteração local ainda não sincronizada seria perdida no reload.
    if (!hasSupa && !hasFire) {
      return;
    }

    this._markDirty(family.id);

    const incremental = Array.isArray(opts.changedMemberIds) || Array.isArray(opts.deletedMemberIds);
    const changed = opts.changedMemberIds || [];
    const deleted = opts.deletedMemberIds || [];

    const jobs = [];
    if (hasSupa) {
      jobs.push(incremental
        ? supabaseAdapterInstance.syncFamilyMembers(family, changed, deleted)
        : supabaseAdapterInstance.syncFamily(family));
    }
    if (hasFire) {
      jobs.push(incremental
        ? firebaseAdapterInstance.syncFamilyMembers(family, changed, deleted)
        : firebaseAdapterInstance.syncFamily(family));
    }

    // Timeout para detectar travamento (cota esgotada gera backoff "infinito")
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));

    Promise.race([Promise.all(jobs), timeout])
      .then(() => { this._clearDirty(family.id); })
      .catch((err) => { this._notifyCloudError(err); });
  }

  static getActiveFamily() {
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_FAMILY);
    if (!activeId) return null;
    const families = this.getFamilies();
    return families.find(f => f.id === activeId) || null;
  }

  static setActiveFamily(familyId) {
    if (familyId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_FAMILY, familyId);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_FAMILY);
    }
  }

  // Mescla os dados vindos da nuvem com o local, PRESERVANDO as famílias que
  // têm alterações ainda não sincronizadas (pendentes). Assim uma foto recém
  // salva não é sobrescrita por uma versão antiga da nuvem ao recarregar.
  static _mergeCloudWithLocal(cloudFamilies) {
    const dirty = this._getDirty();
    if (dirty.length === 0) return cloudFamilies;
    const local = this.getFamilies();
    const byId = new Map(cloudFamilies.map(f => [f.id, f]));
    dirty.forEach(id => {
      const localFam = local.find(f => f.id === id);
      if (localFam) byId.set(id, localFam);
    });
    return Array.from(byId.values());
  }

  // Limita a espera por uma promessa para o app não travar se a nuvem ficar em
  // backoff (cota esgotada faz as leituras nunca resolverem).
  static _withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
  }

  static async syncFromSupabase() {
    let cloudFamilies = null;

    if (supabaseAdapterInstance.isConfigured()) {
      try {
        const families = await this._withTimeout(supabaseAdapterInstance.loadFamilies(), 10000);
        if (families && families.length > 0) cloudFamilies = families;
      } catch (err) {
        this._notifyCloudError(err);
      }
    }
    if (firebaseAdapterInstance.isConfigured()) {
      try {
        const families = await this._withTimeout(firebaseAdapterInstance.loadAllFamilies(), 10000);
        if (families && families.length > 0) cloudFamilies = families;
      } catch (err) {
        // Nuvem indisponível (ex.: cota esgotada na leitura): mantém os dados locais
        this._notifyCloudError(err);
      }
    }

    if (cloudFamilies) {
      const merged = this._mergeCloudWithLocal(cloudFamilies);
      localStorage.setItem(STORAGE_KEY_FAMILIES, JSON.stringify(merged));
      const active = this.getActiveFamily();
      if (!active && merged.length > 0) {
        this.setActiveFamily(merged[0].id);
      }
    }
  }

  static loadDemoFamily() {
    let families = this.getFamilies();
    const existingIndex = families.findIndex(f => f.id === DEMO_FAMILY.id);
    if (existingIndex !== -1) {
      families[existingIndex] = DEMO_FAMILY;
    } else {
      families.push(DEMO_FAMILY);
    }
    // Persiste tudo localmente, mas sincroniza na nuvem APENAS a família demo.
    // Evita reescrever todas as famílias (ex.: a árvore real de 132 membros) na
    // nuvem a cada clique em "Experimentar Demonstração", o que queimava a cota.
    localStorage.setItem(STORAGE_KEY_FAMILIES, JSON.stringify(families));
    this._cloudSyncFamily(DEMO_FAMILY);
    this.setActiveFamily(DEMO_FAMILY.id);
    return DEMO_FAMILY;
  }

  static createFamily(name, userName, userPhoto) {
    const familyId = 'fam_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const code = 'RAIZ-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const rootMemberId = 'mem_' + Date.now();

    const rootMember = {
      id: rootMemberId,
      name: userName,
      birthDate: new Date().toISOString().split('T')[0],
      photo: userPhoto || DEFAULT_SILHOUETTE,
      role: 'Raiz',
      parentId: null,
      partnerId: null,
      childrenIds: [],
      bio: 'Fundador desta árvore genealógica.'
    };

    const newFamily = {
      id: familyId,
      name: name,
      code: code,
      rootMemberId: rootMemberId,
      members: [rootMember],
      subFamilies: []
    };

    const families = this.getFamilies();
    families.push(newFamily);
    // Sincroniza na nuvem apenas a família recém-criada (não reescreve as demais).
    localStorage.setItem(STORAGE_KEY_FAMILIES, JSON.stringify(families));
    this._cloudSyncFamily(newFamily);
    this.setActiveFamily(familyId);
    return newFamily;
  }

  // Salva a família APENAS localmente (sem sincronizar na nuvem nem marcar pendência).
  // Usado por rotinas de higiene de dados que rodam a cada carregamento e não devem
  // gerar gravações na nuvem (evita queimar a cota do banco em todo reload).
  static saveFamilyLocal(updatedFamily) {
    const families = this.getFamilies();
    const index = families.findIndex(f => f.id === updatedFamily.id);
    if (index !== -1) {
      families[index] = updatedFamily;
      localStorage.setItem(STORAGE_KEY_FAMILIES, JSON.stringify(families));
    }
  }

  static saveFamily(updatedFamily, opts = {}) {
    const families = this.getFamilies();
    const index = families.findIndex(f => f.id === updatedFamily.id);
    if (index !== -1) {
      families[index] = updatedFamily;
      // Persiste localmente (rápido) e sincroniza APENAS esta família na nuvem.
      // Evita a sincronização dupla/de todas as famílias que antes multiplicava
      // as gravações e estourava a cota do Firestore.
      localStorage.setItem(STORAGE_KEY_FAMILIES, JSON.stringify(families));
      this._cloudSyncFamily(updatedFamily, opts);
    }
  }

  static findFamilyByCode(code) {
    const families = this.getFamilies();
    return families.find(f => f.code.toUpperCase() === code.toUpperCase()) || null;
  }

  static deleteActiveFamily() {
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_FAMILY);
    if (!activeId) return;
    let families = this.getFamilies();
    families = families.filter(f => f.id !== activeId);
    this.saveFamilies(families);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_FAMILY);
  }
}

export default StorageManager;
