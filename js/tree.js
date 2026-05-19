// Módulo de Renderização Visual e Interativa da Árvore Genealógica

const DEFAULT_SILHOUETTE = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22%2394a3b8%22%3E%3Cpath%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E';

class TreeRenderer {
  constructor(containerId, onMemberClick, onAddRelativeClick) {
    this.container = document.getElementById(containerId);
    this.onMemberClick = onMemberClick;
    this.onAddRelativeClick = onAddRelativeClick;
    this.zoomLevel = 1;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.translateX = 0;
    this.translateY = 0;

    this.initControls();
  }

  initControls() {
    const workspace = this.container ? this.container.closest('.tree-workspace') : null;
    if (!workspace) return;

    // Zoom com a roda do mouse
    workspace.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        this.zoomIn();
      } else {
        this.zoomOut();
      }
    });

    // Pan / Dragging com o mouse
    workspace.addEventListener('mousedown', (e) => {
      if (e.target.closest('.tree-card') || e.target.closest('.btn')) return;
      this.isDragging = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
      workspace.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this.updateTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      if (workspace) workspace.style.cursor = 'default';
    });
  }

  zoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel + 0.1, 2);
    this.updateTransform();
  }

  zoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.5);
    this.updateTransform();
  }

  resetZoom() {
    this.zoomLevel = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.updateTransform();
  }

  updateTransform() {
    if (this.container) {
      this.container.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoomLevel})`;
    }
  }

  render(family) {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (!family || !family.members || family.members.length === 0) {
      this.container.innerHTML = `<div style="text-align: center; color: var(--text-muted);">Árvore vazia. Adicione o primeiro membro!</div>`;
      return;
    }

    // Reconstrução dinâmica e defensiva de childrenIds baseada em parentId para garantir resiliência contra dados legados da nuvem
    family.members.forEach(m => {
      if (!m.childrenIds) m.childrenIds = [];
    });
    family.members.forEach(m => {
      if (m.parentId) {
        const parent = family.members.find(p => p.id === m.parentId);
        if (parent && !parent.childrenIds.includes(m.id)) {
          parent.childrenIds.push(m.id);
        }
      }
    });

    const membersMap = new Map(family.members.map(m => [m.id, m]));
    const founder = membersMap.get(family.rootMemberId) || family.members[0];
    if (!founder) return;

    // Identifica o cônjuge do fundador
    const partner = family.members.find(m => m.role === 'Cônjuge' || m.partnerId === founder.id || founder.partnerId === m.id);

    // Geração 3 (Galhos / Filhos no TOPO da árvore): Filhos do fundador ou cônjuge, ou com role 'Filho', 'Filho(a)'
    const gen3 = family.members.filter(m => {
      if (m.id === founder.id || (partner && m.id === partner.id)) return false;
      return m.role === 'Filho' || m.role === 'Filho(a)' || m.parentId === founder.id || (partner && m.parentId === partner.id);
    });

    // Geração 2 (Casal Principal + Irmãos no MEIO da árvore): Fundador, cônjuge, e irmãos do fundador/cônjuge
    const gen2 = family.members.filter(m => {
      if (m.id === founder.id || (partner && m.id === partner.id)) return true;
      if (gen3.some(c => c.id === m.id)) return false;
      // Para ser irmão da Geração 2 (Irmão do Danilo ou da Bruna), o role tem que ser 'Irmão'/'Irmã' E NÃO PODE ter 'Bertonha' no nome (pois Bertonha é a família da mãe, Geração 1!)
      const isFounderBro = (m.role === 'Irmão' || m.role === 'Irmã') && (!m.name || !m.name.includes('Bertonha'));
      const isSiblingByParent = (founder.parentId && m.parentId === founder.parentId) || (partner && partner.parentId && m.parentId === partner.parentId);
      return isFounderBro || isSiblingByParent;
    });

    // Geração 1 (Pais / Tios / Maria Lucia e Luiz Messias Bertonha na BASE da árvore): Pais/mães do fundador ou cônjuge E seus irmãos (tios do fundador)
    const gen1 = family.members.filter(m => {
      if (m.id === founder.id || (partner && m.id === partner.id) || gen2.some(p => p.id === m.id) || gen3.some(c => c.id === m.id)) return false;
      // Se for Aparecida Minatel (avó), vai para gen0
      if (m.name && m.name.includes('Aparecida')) return false;
      // Entra se for Pai/Mãe, ou se tiver o mesmo parentId da Maria Lucia (irmãos da mãe/tios), ou se tiver role 'Tio', 'Tia'
      // E TAMBÉM se tiver role 'Irmão'/'Irmã' E tiver 'Bertonha' no nome (pois é irmão da Maria Lucia Bertonha!)
      const isParent = m.role === 'Pai/Mãe' || m.role === 'Pai' || m.role === 'Mãe' || m.id === founder.parentId || (partner && m.id === partner.parentId);
      const isUncle = m.role === 'Tio' || m.role === 'Tia' || (founder.parentId && membersMap.has(founder.parentId) && m.parentId === membersMap.get(founder.parentId).parentId);
      const isMotherBro = (m.role === 'Irmão' || m.role === 'Irmã') && m.name && m.name.includes('Bertonha');
      return isParent || isUncle || isMotherBro;
    });

    // Geração 0 (Avós / Aparecida Minatel na BASE MAIS PROFUNDA DA TERRA): Pais/mães da gen1 (ex: Aparecida Minatel)
    const gen0 = family.members.filter(m => {
      if (m.id === founder.id || (partner && m.id === partner.id) || gen3.some(c => c.id === m.id) || gen2.some(p => p.id === m.id) || gen1.some(p => p.id === m.id)) return false;
      return m.name && m.name.includes('Aparecida');
    });

    // Outros membros (garantia de que ninguém fique órfão na tela)
    const assignedIds = new Set([...gen0, ...gen1, ...gen2, ...gen3].map(m => m.id));
    const others = family.members.filter(m => !assignedIds.has(m.id));

    // 1. Renderiza Outros no topo (se houver)
    if (others.length > 0) {
      const level4Container = document.createElement('div');
      level4Container.className = 'tree-level';
      others.forEach(member => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'tree-node-group';
        const partnersDiv = document.createElement('div');
        partnersDiv.className = 'tree-node-partners';
        partnersDiv.appendChild(this.createCard(member, family.rootMemberId));
        groupDiv.appendChild(partnersDiv);
        level4Container.appendChild(groupDiv);
      });
      this.container.appendChild(level4Container);
    }

    // 2. Renderiza Geração 3 (Galhos / Filhos no TOPO da árvore)
    if (gen3.length > 0) {
      const level3Container = document.createElement('div');
      level3Container.className = 'tree-level';
      gen3.forEach(member => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'tree-node-group';
        const partnersDiv = document.createElement('div');
        partnersDiv.className = 'tree-node-partners';
        partnersDiv.appendChild(this.createCard(member, family.rootMemberId));
        groupDiv.appendChild(partnersDiv);
        level3Container.appendChild(groupDiv);
      });
      this.container.appendChild(level3Container);
    }

    // 3. Renderiza Geração 2 (Casal Principal + Irmãos no MEIO da árvore)
    if (gen2.length > 0) {
      const level2Container = document.createElement('div');
      level2Container.className = 'tree-level';
      
      // A. Renderiza irmãos do fundador (ex: Leandro) à ESQUERDA do casal, em seu próprio grupo independente
      gen2.forEach(m => {
        if (m.id !== founder.id && (!partner || m.id !== partner.id)) {
          const broGroup = document.createElement('div');
          broGroup.className = 'tree-node-group';
          const broPartners = document.createElement('div');
          broPartners.className = 'tree-node-partners';
          broPartners.appendChild(this.createCard(m, family.rootMemberId));
          broGroup.appendChild(broPartners);
          level2Container.appendChild(broGroup);
        }
      });

      // B. Renderiza o grupo exclusivo do casal (Danilo e Bruna unidos pela linha rosa)
      const coupleGroup = document.createElement('div');
      coupleGroup.className = 'tree-node-group';
      const couplePartners = document.createElement('div');
      couplePartners.className = 'tree-node-partners';
      
      if (gen2.some(m => m.id === founder.id)) {
        couplePartners.appendChild(this.createCard(founder, family.rootMemberId));
      }
      if (partner && gen2.some(m => m.id === partner.id)) {
        couplePartners.appendChild(this.createCard(partner, family.rootMemberId));
      }
      coupleGroup.appendChild(couplePartners);
      level2Container.appendChild(coupleGroup);

      this.container.appendChild(level2Container);
    }

    // 4. Renderiza Geração 1 (Pais / Tios / Maria Lucia e Luiz Messias Bertonha na BASE da árvore)
    if (gen1.length > 0) {
      const level1Container = document.createElement('div');
      level1Container.className = 'tree-level';
      gen1.forEach(member => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'tree-node-group';
        const partnersDiv = document.createElement('div');
        partnersDiv.className = 'tree-node-partners';
        partnersDiv.appendChild(this.createCard(member, family.rootMemberId));
        groupDiv.appendChild(partnersDiv);
        level1Container.appendChild(groupDiv);
      });
      this.container.appendChild(level1Container);
    }

    // 5. Renderiza Geração 0 (Avós / Aparecida Minatel na BASE MAIS PROFUNDA DA TERRA)
    if (gen0.length > 0) {
      const level0Container = document.createElement('div');
      level0Container.className = 'tree-level';
      gen0.forEach(member => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'tree-node-group';
        const partnersDiv = document.createElement('div');
        partnersDiv.className = 'tree-node-partners';
        partnersDiv.appendChild(this.createCard(member, family.rootMemberId));
        groupDiv.appendChild(partnersDiv);
        level0Container.appendChild(groupDiv);
      });
      this.container.appendChild(level0Container);
    }

    this.updateTransform();
  }

  createCard(member, familyRootId) {
    const card = document.createElement('div');
    card.className = `tree-card ${member.id === familyRootId ? 'root-member' : ''}`;
    card.dataset.id = member.id;

    // Formata a data de nascimento e falecimento
    let birthStr = member.birthDate;
    if (birthStr) {
      const parts = birthStr.split('-');
      if (parts.length === 3) birthStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    let deathStr = member.deathDate;
    if (deathStr) {
      const parts = deathStr.split('-');
      if (parts.length === 3) deathStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    let datesText = birthStr ? birthStr : 'Data desconhecida';
    if (member.status === 'falecido') {
      datesText = `${birthStr || '?'} - ${deathStr || '?'}`;
    }

    // Configuração de Badges Visuais (In Memoriam vs Convite Pendente)
    let badgeHtml = '';
    let miniActionsHtml = `<button class="btn-mini btn-add-rel" title="Adicionar Parente" data-id="${member.id}">+</button>`;

    if (member.status === 'falecido') {
      badgeHtml = `<span class="badge-status deceased">🕊️ In Memoriam</span>`;
    } else if (member.status === 'pendente' || member.memberType === 'invite') {
      badgeHtml = `<span class="badge-status pending" title="Clique para reenviar convite">⏳ Convite Pendente</span>`;
      miniActionsHtml += `<button class="btn-mini btn-resend-inv" title="Reenviar Convite" data-id="${member.id}">✉</button>`;
    }

    card.innerHTML = `
      ${badgeHtml}
      <div class="member-avatar-wrapper">
        <img src="${member.photo}" alt="${member.name}" class="member-avatar" onerror="this.src='${DEFAULT_SILHOUETTE}'">
        <span class="member-role-badge">${member.role}</span>
      </div>
      <div class="member-info">
        <div class="member-name" title="${member.name}">${member.name}</div>
        <div class="member-dates">${datesText}</div>
      </div>
      <div class="member-actions-mini">
        ${miniActionsHtml}
      </div>
    `;

    // Evento de clique para expandir/editar detalhes ou reenviar convite
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-mini')) return;
      if (this.onMemberClick) this.onMemberClick(member);
    });

    // Evento de clique no botão mini de adicionar parente
    const addBtn = card.querySelector('.btn-add-rel');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onAddRelativeClick) this.onAddRelativeClick(member);
      });
    }

    // Evento de clique no botão mini de reenviar convite
    const resendBtn = card.querySelector('.btn-resend-inv');
    if (resendBtn) {
      resendBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.appInstance && window.appInstance.resendInvite) {
          window.appInstance.resendInvite(member);
        }
      });
    }

    return card;
  }
}

export default TreeRenderer;
