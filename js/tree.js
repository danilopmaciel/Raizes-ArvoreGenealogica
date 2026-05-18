// Módulo de Renderização Visual e Interativa da Árvore Genealógica

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

    // Organiza os membros por níveis hierárquicos
    // Nível 1: Avós / Pais sem parentId
    // Nível 2: Filhos dos membros do Nível 1
    // Nível 3: Netos / Filhos do Nível 2

    const membersMap = new Map(family.members.map(m => [m.id, m]));
    const rootMembers = family.members.filter(m => !m.parentId);

    // Cria o container do primeiro nível
    const level1Container = document.createElement('div');
    level1Container.className = 'tree-level';

    rootMembers.forEach(rootMember => {
      // Verifica se o membro tem parceiro/cônjuge
      let partner = null;
      if (rootMember.partnerId && membersMap.has(rootMember.partnerId)) {
        partner = membersMap.get(rootMember.partnerId);
      }

      // Para evitar renderizar o parceiro duas vezes como raiz
      if (partner && partner.id < rootMember.id && !partner.parentId) {
        return; // Já foi ou será renderizado no par do parceiro
      }

      const groupDiv = this.createNodeGroup(rootMember, partner, membersMap, family.rootMemberId);
      level1Container.appendChild(groupDiv);
    });

    this.container.appendChild(level1Container);
    this.updateTransform();
  }

  createNodeGroup(member, partner, membersMap, familyRootId) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'tree-node-group';

    const partnersDiv = document.createElement('div');
    partnersDiv.className = 'tree-node-partners';

    const memberCard = this.createCard(member, familyRootId);
    partnersDiv.appendChild(memberCard);

    if (partner) {
      const partnerCard = this.createCard(partner, familyRootId);
      partnersDiv.appendChild(partnerCard);
    }

    groupDiv.appendChild(partnersDiv);

    // Renderiza os filhos deste membro (ou do casal)
    const childrenIds = member.childrenIds || [];
    if (partner && partner.childrenIds) {
      partner.childrenIds.forEach(cid => {
        if (!childrenIds.includes(cid)) childrenIds.push(cid);
      });
    }

    if (childrenIds.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-level';

      childrenIds.forEach(childId => {
        const child = membersMap.get(childId);
        if (child) {
          let childPartner = null;
          if (child.partnerId && membersMap.has(child.partnerId)) {
            childPartner = membersMap.get(child.partnerId);
          }
          const childGroup = this.createNodeGroup(child, childPartner, membersMap, familyRootId);
          childrenContainer.appendChild(childGroup);
        }
      });

      groupDiv.appendChild(childrenContainer);
    }

    return groupDiv;
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
        <img src="${member.photo}" alt="${member.name}" class="member-avatar" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'">
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
