// Módulo de Gerenciamento de Armazenamento (LocalStorage), Dados Demo e Sincronização Supabase

import supabaseAdapterInstance from './supabase.js';

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
      children: ['mem_demo_root', 'mem_demo_tio'],
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
    const user = localStorage.getItem(STORAGE_KEY_USER);
    return user ? JSON.parse(user) : null;
  }

  static setCurrentUser(user) {
    if (user) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  }

  static getFamilies() {
    const families = localStorage.getItem(STORAGE_KEY_FAMILIES);
    return families ? JSON.parse(families) : [];
  }

  static saveFamilies(families) {
    localStorage.setItem(STORAGE_KEY_FAMILIES, JSON.stringify(families));
    if (supabaseAdapterInstance.isConfigured()) {
      families.forEach(f => supabaseAdapterInstance.syncFamily(f));
    }
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

  static async syncFromSupabase() {
    if (supabaseAdapterInstance.isConfigured()) {
      const families = await supabaseAdapterInstance.loadFamilies();
      if (families && families.length > 0) {
        localStorage.setItem(STORAGE_KEY_FAMILIES, JSON.stringify(families));
        const active = this.getActiveFamily();
        if (!active && families.length > 0) {
          this.setActiveFamily(families[0].id);
        }
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
    this.saveFamilies(families);
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
      photo: userPhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
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
    this.saveFamilies(families);
    this.setActiveFamily(familyId);
    return newFamily;
  }

  static saveFamily(updatedFamily) {
    const families = this.getFamilies();
    const index = families.findIndex(f => f.id === updatedFamily.id);
    if (index !== -1) {
      families[index] = updatedFamily;
      this.saveFamilies(families);
      if (supabaseAdapterInstance.isConfigured()) {
        supabaseAdapterInstance.syncFamily(updatedFamily);
      }
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
