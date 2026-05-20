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
    this.orientation = localStorage.getItem('tree_orientation') || 'top-down';
    this.lineStyle = localStorage.getItem('tree_line_style') || 'curved';

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
    this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.15);
    this.updateTransform();
  }

  resetZoom() {
    this.zoomLevel = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.updateTransform();
    setTimeout(() => this.centerOnFounder(), 50);
  }

  toggleOrientation() {
    this.orientation = this.orientation === 'top-down' ? 'bottom-up' : 'top-down';
    localStorage.setItem('tree_orientation', this.orientation);
    if (this.currentFamily) {
      this.render(this.currentFamily);
    }
  }

  toggleLineStyle() {
    this.lineStyle = this.lineStyle === 'curved' ? 'orthogonal' : 'curved';
    localStorage.setItem('tree_line_style', this.lineStyle);
    if (this.currentFamily) {
      this.render(this.currentFamily);
    }
  }

  centerOnFounder() {
    const workspace = this.container ? this.container.closest('.tree-workspace') : null;
    if (!workspace) return;
    const founderCard = this.container.querySelector('.tree-card.root-member');
    if (!founderCard) return;

    // Temporarily reset transform to get actual untransformed dimensions
    const originalTransform = this.container.style.transform;
    this.container.style.transform = 'none';

    const workspaceRect = workspace.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const founderRect = founderCard.getBoundingClientRect();

    const founderX = founderRect.left - containerRect.left;
    const founderWidth = founderRect.width;

    // Restore transform
    this.container.style.transform = originalTransform;

    // Center founder card horizontally, place it near the top
    this.translateX = (workspaceRect.width / 2) - (founderX + founderWidth / 2);
    this.translateY = 40;
    this.zoomLevel = 1.0;

    // Auto zoom out if the tree is wider than the workspace
    const containerWidth = containerRect.width;
    if (containerWidth > workspaceRect.width * 0.9 && containerWidth > 0) {
      this.zoomLevel = Math.max((workspaceRect.width * 0.9) / containerWidth, 0.15);
      // Re-center under new zoom level
      this.translateX = (workspaceRect.width / 2) - (founderX + founderWidth / 2) * this.zoomLevel;
    }

    this.updateTransform();
  }

  updateTransform() {
    if (this.container) {
      this.container.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoomLevel})`;
    }
  }

  render(family) {
    if (!this.container) return;
    this.container.style.alignItems = 'flex-start';
    this.currentFamily = family;
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

    // 2. Cálculo Dinâmico de Coordenadas Horizontais (Eixo X) usando árvore de LayoutNodes
    class LayoutNode {
      constructor(type, members) {
        this.type = type; // 'single' or 'couple'
        this.members = members; // array of 1 or 2 member objects
        this.children = [];
        this.parent = null;
        this.width = 0;
        this.x = 0; // absolute X coordinate
      }
    }

    const nodes = [];
    const memberToNode = new Map();
    const visitedMembers = new Set();

    // Encontrar casais e criar nodes
    family.members.forEach(m => {
      if (visitedMembers.has(m.id)) return;
      
      const partnerId = m.partnerId || (family.members.find(p => p.partnerId === m.id) || {}).id;
      if (partnerId) {
        const partner = family.members.find(p => p.id === partnerId);
        if (partner) {
          const coupleNode = new LayoutNode('couple', [m, partner]);
          nodes.push(coupleNode);
          memberToNode.set(m.id, coupleNode);
          memberToNode.set(partner.id, coupleNode);
          visitedMembers.add(m.id);
          visitedMembers.add(partner.id);
          return;
        }
      }
      
      const singleNode = new LayoutNode('single', [m]);
      nodes.push(singleNode);
      memberToNode.set(m.id, singleNode);
      visitedMembers.add(m.id);
    });

    // Estabelecer relações pai-filho entre os nodes
    nodes.forEach(node => {
      const parentId = node.members[0].parentId || (node.members[1] ? node.members[1].parentId : null);
      if (parentId) {
        const parentNode = memberToNode.get(parentId);
        if (parentNode && parentNode !== node) {
          node.parent = parentNode;
          if (!parentNode.children.includes(node)) {
            parentNode.children.push(node);
          }
        }
      }
    });

    // Encontrar os nodes raiz (que não têm pai)
    const roots = nodes.filter(n => !n.parent);

    // Medição recursiva de largura das subárvores
    function measureNode(n) {
      if (n.children.length === 0) {
        n.width = n.type === 'couple' ? 2.2 : 1.0;
        return n.width;
      }
      
      let childrenWidthSum = 0;
      n.children.forEach((child, index) => {
        childrenWidthSum += measureNode(child);
        if (index < n.children.length - 1) {
          const nextChild = n.children[index + 1];
          // Se qualquer um dos filhos adjacentes tiver filhos (uma subárvore/ramo), usa espaçamento maior de ramos (0.9).
          // Caso contrário, são apenas irmãos folhas simples, então usa espaçamento menor (0.35).
          const spacing = (child.children.length > 0 || nextChild.children.length > 0) ? 0.9 : 0.35;
          childrenWidthSum += spacing;
        }
      });
      
      const selfWidth = n.type === 'couple' ? 2.2 : 1.0;
      n.width = Math.max(selfWidth, childrenWidthSum);
      return n.width;
    }

    // Mede todas as raízes
    roots.forEach(root => measureNode(root));

    // Posicionamento recursivo top-down
    function positionNode(n, leftX) {
      const selfWidth = n.type === 'couple' ? 2.2 : 1.0;
      
      if (n.children.length === 0) {
        n.x = leftX + (n.width - selfWidth) / 2;
        return;
      }
      
      let childrenTotalWidth = 0;
      n.children.forEach((child, index) => {
        childrenTotalWidth += child.width;
        if (index < n.children.length - 1) {
          const nextChild = n.children[index + 1];
          const spacing = (child.children.length > 0 || nextChild.children.length > 0) ? 0.9 : 0.35;
          childrenTotalWidth += spacing;
        }
      });
      
      if (selfWidth >= childrenTotalWidth) {
        n.x = leftX + (n.width - selfWidth) / 2;
        
        let childLeftX = leftX + (n.width - childrenTotalWidth) / 2;
        n.children.forEach((child, index) => {
          positionNode(child, childLeftX);
          const nextChild = n.children[index + 1];
          const spacing = nextChild ? ((child.children.length > 0 || nextChild.children.length > 0) ? 0.9 : 0.35) : 0;
          childLeftX += child.width + spacing;
        });
      } else {
        n.x = leftX + (n.width - selfWidth) / 2;
        
        let childLeftX = leftX;
        n.children.forEach((child, index) => {
          positionNode(child, childLeftX);
          const nextChild = n.children[index + 1];
          const spacing = nextChild ? ((child.children.length > 0 || nextChild.children.length > 0) ? 0.9 : 0.35) : 0;
          childLeftX += child.width + spacing;
        });
      }
    }

    // Posiciona as raízes lado a lado
    let currentRootLeftX = 0;
    const rootSpacing = 1.0;
    roots.forEach(root => {
      positionNode(root, currentRootLeftX);
      currentRootLeftX += root.width + rootSpacing;
    });

    // Normaliza os X para que o nó mais à esquerda comece exatamente em 0
    if (nodes.length > 0) {
      const minX = Math.min(...nodes.map(n => n.x));
      nodes.forEach(n => {
        n.x -= minX;
      });
    }

    // Mapeia de volta as coordenadas para xMap
    const xMap = {};
    nodes.forEach(node => {
      if (node.type === 'couple') {
        xMap[node.members[0].id] = node.x;
        xMap[node.members[1].id] = node.x + 1.2;
      } else {
        xMap[node.members[0].id] = node.x;
      }
    });

    // Garante que todos tenham alguma coordenada X
    family.members.forEach(m => {
      if (xMap[m.id] === undefined) {
        xMap[m.id] = 0;
      }
    });

    // Ordena as gerações conforme a orientação selecionada (top-down: mais velhos no topo; bottom-up: mais novos no topo)
    const generations = [...new Set(Object.values(generationMap))].sort((a, b) => {
      return this.orientation === 'top-down' ? a - b : b - a;
    });

    generations.forEach(gen => {
      const membersInGen = family.members.filter(m => generationMap[m.id] === gen);
      if (membersInGen.length === 0) return;

      const levelContainer = document.createElement('div');
      levelContainer.className = 'tree-level';
      levelContainer.style.justifyContent = 'flex-start';
      levelContainer.style.gap = '0';

      // Agrupa os membros em casais e indivíduos dentro desta geração e ordena por X
      const nodesInGen = [];
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
          nodesInGen.push({
            type: 'couple',
            members: members,
            x: xMap[members[0].id] // Usamos o X do primeiro membro para o posicionamento do grupo
          });
          renderedIds.add(member.id);
          renderedIds.add(partnerMember.id);
        } else {
          nodesInGen.push({
            type: 'single',
            member: member,
            x: xMap[member.id]
          });
          renderedIds.add(member.id);
        }
      });

      // Ordena os nós (casais e indivíduos) pelo seu X médio
      nodesInGen.sort((a, b) => a.x - b.x);

      // Renderiza os nós na ordem correta
      let prevNode = null;
      nodesInGen.forEach(node => {
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

        // Aplica o espaçamento horizontal exato baseado na diferença de X
        const scale = 220; // 1 unidade = 220px
        const cardWidth = 200;
        const coupleWidth = 424;
        const targetX = node.x * scale;

        if (prevNode) {
          const prevWidth = prevNode.type === 'couple' ? coupleWidth : cardWidth;
          const prevEndX = prevNode.x * scale + prevWidth;
          let marginLeft = targetX - prevEndX;
          if (marginLeft < 24) marginLeft = 24; // Espaçamento mínimo de segurança (24px)
          groupDiv.style.marginLeft = `${marginLeft}px`;
        } else {
          // Para o primeiro nó da linha, aplica a margem esquerda inicial para alinhar horizontalmente as gerações
          groupDiv.style.marginLeft = `${targetX}px`;
        }

        levelContainer.appendChild(groupDiv);
        prevNode = node;
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

    const drawLine = (childId, parentId) => {
      const childCard = this.container.querySelector(`.tree-card[data-id="${childId}"]`);
      const parentCard = this.container.querySelector(`.tree-card[data-id="${parentId}"]`);
      if (childCard && parentCard) {
        const childRect = childCard.getBoundingClientRect();
        const parentRect = parentCard.getBoundingClientRect();

        const childX = (childRect.left - containerRect.left) / this.zoomLevel + (childRect.width / this.zoomLevel) / 2;
        const parentX = (parentRect.left - containerRect.left) / this.zoomLevel + (parentRect.width / this.zoomLevel) / 2;

        let childY, parentY;
        if (childRect.top > parentRect.bottom) {
          // O filho está abaixo do pai (orientação clássica top-down)
          childY = (childRect.top - containerRect.top) / this.zoomLevel;
          parentY = (parentRect.bottom - containerRect.top) / this.zoomLevel;
        } else {
          // O filho está acima do pai (orientação bottom-up)
          childY = (childRect.bottom - containerRect.top) / this.zoomLevel;
          parentY = (parentRect.top - containerRect.top) / this.zoomLevel;
        }

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midY = (childY + parentY) / 2;

        let pathD = '';
        if (this.lineStyle === 'orthogonal') {
          // Conexões ortogonais limpas e geométricas
          pathD = `M ${parentX} ${parentY} L ${parentX} ${midY} L ${childX} ${midY} L ${childX} ${childY}`;
        } else {
          // Conexões curvas suaves em curva Bezier
          pathD = `M ${childX} ${childY} C ${childX} ${midY}, ${parentX} ${midY}, ${parentX} ${parentY}`;
        }

        path.setAttribute('d', pathD);
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
    setTimeout(() => this.centerOnFounder(), 100);
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

    // Se o papel é "Filho" ou "Filha" mas o pai/mãe não é o fundador ou parceiro do fundador
    if (this.currentFamily) {
      const founder = this.currentFamily.members.find(m => m.id === familyRootId);
      const partner = founder ? this.currentFamily.members.find(m => m.role === 'Cônjuge' || m.partnerId === founder.id || founder.partnerId === m.id) : null;
      
      if ((member.role === 'Filho' || member.role === 'Filha' || member.role === 'Filho(a)') && member.parentId && member.parentId !== familyRootId && (!partner || member.parentId !== partner.id)) {
        displayRole = 'Primo/Prima';
      }
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
