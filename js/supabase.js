// Adaptador do Supabase para a Plataforma Raízes

class SupabaseAdapter {
  constructor() {
    this.client = null;
    this.init();
  }

  init() {
    const url = localStorage.getItem('raizes_supabase_url');
    const key = localStorage.getItem('raizes_supabase_key');
    if (url && key && window.supabase) {
      try {
        this.client = window.supabase.createClient(url, key);
      } catch (err) {
        console.error('Erro ao inicializar cliente Supabase:', err);
      }
    }
  }

  isConfigured() {
    return this.client !== null;
  }

  async configure(url, key) {
    if (!url || !key) throw new Error('URL e Chave são obrigatórias.');
    try {
      const client = window.supabase.createClient(url, key);
      // Teste simples de conexão
      const { error } = await client.from('raizes_families').select('id').limit(1);
      if (error) throw error;

      localStorage.setItem('raizes_supabase_url', url);
      localStorage.setItem('raizes_supabase_key', key);
      this.client = client;
      return true;
    } catch (err) {
      throw new Error('Falha ao conectar no Supabase. Verifique suas credenciais e se as tabelas foram criadas conforme a migração.');
    }
  }

  disconnect() {
    localStorage.removeItem('raizes_supabase_url');
    localStorage.removeItem('raizes_supabase_key');
    this.client = null;
  }

  _memberRow(m, familyId) {
    return {
      id: m.id,
      family_id: familyId,
      name: m.name,
      birth_date: m.birthDate || null,
      death_date: m.deathDate || null,
      status: m.status || 'vivo',
      bio: m.bio || '',
      photo: m.photo || '',
      role: m.role || 'Parente',
      parent_id: m.parentId || null,
      partner_id: m.partnerId || null,
      member_type: m.memberType || 'offline',
      linked_user_id: m.linkedUserId || null,
      children_ids: m.childrenIds || []
    };
  }

  // Sincronização INCREMENTAL: grava apenas os membros alterados (e remove os excluídos).
  async syncFamilyMembers(family, changedIds = [], deletedIds = []) {
    if (!this.isConfigured()) return;

    const familyData = {
      id: family.id,
      name: family.name,
      code: family.code,
      root_member_id: family.rootMemberId,
      sub_families: family.subFamilies || []
    };
    const { error: famError } = await this.client.from('raizes_families').upsert(familyData);
    if (famError) throw famError;

    const memberById = new Map((family.members || []).map(m => [m.id, m]));
    const rows = [...new Set(changedIds)]
      .map(id => memberById.get(id))
      .filter(Boolean)
      .map(m => this._memberRow(m, family.id));

    if (rows.length > 0) {
      const { error: upError } = await this.client.from('raizes_members').upsert(rows);
      if (upError) throw upError;
    }

    const dels = [...new Set(deletedIds)];
    if (dels.length > 0) {
      const { error: delError } = await this.client
        .from('raizes_members')
        .delete()
        .in('id', dels);
      if (delError) throw delError;
    }
  }

  async syncFamily(family) {
    if (!this.isConfigured()) return;

    try {
      // 1. Salva a família principal
      const familyData = {
        id: family.id,
        name: family.name,
        code: family.code,
        root_member_id: family.rootMemberId,
        sub_families: family.subFamilies || []
      };

      const { error: famError } = await this.client
        .from('raizes_families')
        .upsert(familyData);

      if (famError) throw famError;

      // 2. Salva os membros da família
      if (family.members && family.members.length > 0) {
        // A. Remove membros que foram excluídos localmente
        const currentMemberIds = family.members.map(m => m.id);
        const { error: delError } = await this.client
          .from('raizes_members')
          .delete()
          .eq('family_id', family.id)
          .not('id', 'in', `(${currentMemberIds.join(',')})`);
        
        if (delError) console.error('Erro ao limpar membros antigos no Supabase:', delError);

        // B. Upsert dos membros atuais
        const membersData = family.members.map(m => ({
          id: m.id,
          family_id: family.id,
          name: m.name,
          birth_date: m.birthDate || null,
          death_date: m.deathDate || null,
          status: m.status || 'vivo',
          bio: m.bio || '',
          photo: m.photo || '',
          role: m.role || 'Parente',
          parent_id: m.parentId || null,
          partner_id: m.partnerId || null,
          member_type: m.memberType || 'offline',
          linked_user_id: m.linkedUserId || null,
          children_ids: m.childrenIds || []
        }));

        const { error: memError } = await this.client
          .from('raizes_members')
          .upsert(membersData);

        if (memError) throw memError;
      }
    } catch (err) {
      console.error('Erro ao sincronizar com Supabase:', err);
    }
  }

  async loadFamilies() {
    if (!this.isConfigured()) return null;

    try {
      const { data: familiesData, error: famError } = await this.client
        .from('raizes_families')
        .select('*');

      if (famError) throw famError;
      if (!familiesData || familiesData.length === 0) return [];

      const { data: membersData, error: memError } = await this.client
        .from('raizes_members')
        .select('*');

      if (memError) throw memError;

      // Reconstrói a estrutura de famílias e membros esperada pela aplicação
      const families = familiesData.map(f => {
        const famMembers = (membersData || []).filter(m => m.family_id === f.id).map(m => ({
          id: m.id,
          name: m.name,
          birthDate: m.birth_date || '',
          deathDate: m.death_date || '',
          status: m.status || 'vivo',
          bio: m.bio || '',
          photo: m.photo || '',
          role: m.role || 'Parente',
          parentId: m.parent_id || null,
          partnerId: m.partner_id || null,
          memberType: m.member_type || 'offline',
          linkedUserId: m.linked_user_id || null,
          childrenIds: m.children_ids || []
        }));

        return {
          id: f.id,
          name: f.name,
          code: f.code,
          rootMemberId: f.root_member_id,
          subFamilies: f.sub_families || [],
          members: famMembers
        };
      });

      return families;
    } catch (err) {
      console.error('Erro ao carregar do Supabase:', err);
      return null;
    }
  }
}

const supabaseAdapterInstance = new SupabaseAdapter();
export default supabaseAdapterInstance;
