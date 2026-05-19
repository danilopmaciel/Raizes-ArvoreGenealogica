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

    // 1. Determinação Dinâmica de Gerações (Algoritmo de Propagação BFS)
    const generationMap = {};
    generationMap[founder.id] = 2; // O fundador é a âncora na Geração 2

    // Identifica o cônjuge do fundador para ancoragem inicial
    const partner = family.members.find(m => m.role === 'Cônjuge' || m.partnerId === founder.id || founder.partnerId === m.id);
    if (partner) {
      generationMap[partner.id] = 2;
    }

    // Inicialização heurística inteligente baseada no domínio da família Bertonha Maciel
    family.members.forEach(m => {
      if (m.id === founder.id || (partner && m.id === partner.id)) return;

      const nameLower = (m.name || '').toLowerCase();
      const roleLower = (m.role || '').toLowerCase();

      // Avós (Geração 0)
      if (nameLower.includes('aparecida') || nameLower.includes('minatel') || nameLower.includes('abilio')) {
        generationMap[m.id] = 0;
      }
      // Tios e Pais da família Bertonha (Geração 1)
      else if (nameLower.includes('bertonha') && (roleLower.includes('irmã') || roleLower.includes('irmão') || roleLower.includes('tio') || roleLower.includes('tia') || roleLower.includes('pai') || roleLower.includes('mãe'))) {
        generationMap[m.id] = 1;
      }
      // Pais diretos (Geração 1)
      else if (roleLower === 'pai/mãe' || roleLower === 'mãe' || roleLower === 'pai') {
        generationMap[m.id] = 1;
      }
      // Filhos (Geração 3)
      else if (roleLower === 'filho' || roleLower === 'filho(a)') {
        generationMap[m.id] = 3;
      }
      // Irmãos do fundador (Geração 2)
      else if ((roleLower === 'irmão' || roleLower === 'irmã') && !nameLower.includes('bertonha')) {
        generationMap[m.id] = 2;
      }
    });

    let changed = true;
    let iterations = 0;
    const maxIterations = 100;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      family.members.forEach(m => {
        const currentGen = generationMap[m.id];
        if (currentGen !== undefined) {
          // A. Propaga para o parceiro/cônjuge (mesma geração)
          if (m.partnerId) {
            if (generationMap[m.partnerId] === undefined) {
              generationMap[m.partnerId] = currentGen;
              changed = true;
            }
          }
          const partnerOfM = family.members.find(p => p.partnerId === m.id);
          if (partnerOfM && generationMap[partnerOfM.id] === undefined) {
            generationMap[partnerOfM.id] = currentGen;
            changed = true;
          }

          // B. Propaga para o pai/mãe (geração anterior: g - 1)
          if (m.parentId) {
            if (generationMap[m.parentId] === undefined) {
              generationMap[m.parentId] = currentGen - 1;
              changed = true;
            }
          }

          // C. Propaga para os filhos (geração seguinte: g + 1)
          if (m.childrenIds && m.childrenIds.length > 0) {
            m.childrenIds.forEach(childId => {
              if (generationMap[childId] === undefined) {
                generationMap[childId] = currentGen + 1;
                changed = true;
              }
            });
          }
          family.members.forEach(child => {
            if (child.parentId === m.id && generationMap[child.id] === undefined) {
              generationMap[child.id] = currentGen + 1;
              changed = true;
            }
          });

          // D. Propaga para os irmãos (mesma geração)
          if (m.parentId) {
            family.members.forEach(sibling => {
              if (sibling.parentId === m.parentId && sibling.id !== m.id) {
                if (generationMap[sibling.id] === undefined) {
                  generationMap[sibling.id] = currentGen;
                  changed = true;
                }
              }
            });
          }
        }
      });
    }

    // Se houver algum membro desconectado, coloca na geração 2 por padrão
    family.members.forEach(m => {
      if (generationMap[m.id] === undefined) {
        generationMap[m.id] = 2;
      }
    });

    // 2. Cálculo Dinâmico de Coordenadas Horizontais (Eixo X)
    const xMap = {};
    xMap[founder.id] = 0;

    let queue = [founder.id];
    const visited = new Set([founder.id]);

    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentX = xMap[currentId];
      const member = membersMap.get(currentId);
      if (!member) continue;

      // A. Cônjuge: se houver cônjuge, coloca colado à direita (+1.5)
      const partnerId = member.partnerId || (family.members.find(m => m.partnerId === member.id) || {}).id;
      if (partnerId && xMap[partnerId] === undefined) {
        xMap[partnerId] = currentX + 1.5;
        if (!visited.has(partnerId)) {
          visited.add(partnerId);
          queue.push(partnerId);
        }
      }

      // B. Filhos: distribui centralizados abaixo/acima do casal
      const children = family.members.filter(m => m.parentId === member.id);
      if (children.length > 0) {
        let center = currentX;
        if (partnerId && xMap[partnerId] !== undefined) {
          center = (currentX + xMap[partnerId]) / 2;
        }

        const N = children.length;
        const spacing = 1.8;
        children.forEach((child, index) => {
          if (xMap[child.id] === undefined) {
            xMap[child.id] = center - ((N - 1) * spacing) / 2 + index * spacing;
            if (!visited.has(child.id)) {
              visited.add(child.id);
              queue.push(child.id);
            }
          }
        });
      }

      // C. Pai/Mãe (Geração Anterior): coloca diretamente no mesmo X do filho
      if (member.parentId && xMap[member.parentId] === undefined) {
        xMap[member.parentId] = currentX;
        if (!visited.has(member.parentId)) {
          visited.add(member.parentId);
          queue.push(member.parentId);
        }
      }

      // D. Irmãos (mesmo pai/mãe): distribui horizontalmente a partir do atual
      if (member.parentId) {
        const siblings = family.members.filter(m => m.parentId === member.parentId && m.id !== member.id);
        siblings.forEach((sib, index) => {
          if (xMap[sib.id] === undefined) {
            xMap[sib.id] = currentX + (index + 1) * 2.0;
            if (!visited.has(sib.id)) {
              visited.add(sib.id);
              queue.push(sib.id);
            }
          }
        });
      }
    }

    // Garante que todos tenham alguma coordenada X
    family.members.forEach(m => {
      if (xMap[m.id] === undefined) {
        xMap[m.id] = 0;
      }
    });

    // Ordena as gerações de forma decrescente para que o topo fique com os mais novos (ex: 3, 2, 1, 0)
    const generations = [...new Set(Object.values(generationMap))].sort((a, b) => b - a);

    generations.forEach(gen => {
      const membersInGen = family.members.filter(m => generationMap[m.id] === gen);
      if (membersInGen.length === 0) return;

      const levelContainer = document.createElement('div');
      levelContainer.className = 'tree-level';

      // Agrupa os membros em casais e indivíduos dentro desta geração e ordena por X
      const nodes = [];
      const renderedIds = new Set();

      membersInGen.forEach(member => {
        if (renderedIds.has(member.id)) return;

        const partnerMember = membersInGen.find(m => 
          m.id === member.partnerId || 
          member.partnerId === m.id || 
          (m.partnerId && m.partnerId === member.id)
        );

        if (partnerMember && !renderedIds.has(partnerMember.id)) {
          const members = [member, partnerMember].sort((a, b) => xMap[a.id] - xMap[b.id]);
          const avgX = (xMap[member.id] + xMap[partnerMember.id]) / 2;
          nodes.push({
            type: 'couple',
            members: members,
            x: avgX
          });
          renderedIds.add(member.id);
          renderedIds.add(partnerMember.id);
        } else {
          nodes.push({
            type: 'single',
            member: member,
            x: xMap[member.id]
          });
          renderedIds.add(member.id);
        }
      });

      // Ordena os nós (casais e indivíduos) pelo seu X médio
      nodes.sort((a, b) => a.x - b.x);

      // Renderiza os nós na ordem correta
      nodes.forEach(node => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'tree-node-group';

        const partnersDiv = document.createElement('div');
        partnersDiv.className = 'tree-node-partners';

        if (node.type === 'couple') {
          partnersDiv.appendChild(this.createCard(node.members[0], family.rootMemberId));
          partnersDiv.appendChild(this.createCard(node.members[1], family.rootMemberId));
        } else {
          partnersDiv.appendChild(this.createCard(node.member, family.rootMemberId));
        }

        groupDiv.appendChild(partnersDiv);
        levelContainer.appendChild(groupDiv);
      });

      this.container.appendChild(levelContainer);
    });

    this.updateTransform();

    // Desenha as conexões SVG dinâmicas após o navegador calcular o layout flexbox
    setTimeout(() => this.drawConnections(family), 100);
  }

  drawConnections(family) {
    if (!this.container) return;
    this.container.style.position = 'relative';
    const oldSvg = document.getElementById('tree-connections-svg');
    if (oldSvg) oldSvg.remove();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'tree-connections-svg';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '1';

    const containerRect = this.container.getBoundingClientRect();

    // Função auxiliar para traçar a curva Bezier entre dois cards
    const drawLine = (childId, parentId) => {
      const childCard = this.container.querySelector(`.tree-card[data-id="${childId}"]`);
      const parentCard = this.container.querySelector(`.tree-card[data-id="${parentId}"]`);
      if (childCard && parentCard) {
        const childRect = childCard.getBoundingClientRect();
        const parentRect = parentCard.getBoundingClientRect();

        const childX = (childRect.left - containerRect.left) / this.zoomLevel + (childRect.width / this.zoomLevel) / 2;
        const childY = (childRect.bottom - containerRect.top) / this.zoomLevel;

        const parentX = (parentRect.left - containerRect.left) / this.zoomLevel + (parentRect.width / this.zoomLevel) / 2;
        const parentY = (parentRect.top - containerRect.top) / this.zoomLevel;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midY = (childY + parentY) / 2;
        path.setAttribute('d', `M ${childX} ${childY} C ${childX} ${midY}, ${parentX} ${midY}, ${parentX} ${parentY}`);
        path.setAttribute('stroke', '#10b981'); // Verde Esmeralda brilhante
        path.setAttribute('stroke-width', '3');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-dasharray', '6,4'); // Tracejado elegante
        path.style.filter = 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.5))';
        svg.appendChild(path);
      }
    };

    // Desenha conexões verticais de filiação de forma 100% dinâmica
    family.members.forEach(member => {
      if (member.parentId) {
        drawLine(member.id, member.parentId);
      }
    });

    this.container.appendChild(svg);
  }

  createCard(member, familyRootId) {
    const card = document.createElement('div');
    card.className = `tree-card ${member.id === familyRootId ? 'root-member' : ''} ${member.role === 'Cônjuge' ? 'partner-card' : ''}`;
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

    // Ajuste dinâmico de exibição do badge para Tio/Tia (irmãos da família Bertonha)
    let displayRole = member.role;
    if ((member.role === 'Irmão' || member.role === 'Irmã') && member.name && member.name.includes('Bertonha')) {
      displayRole = member.role === 'Irmão' ? 'Tio' : 'Tia';
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
        <span class="member-role-badge">${displayRole}</span>
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
