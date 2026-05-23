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

    // Zoom com a roda do mouse (centrado no cursor)
    workspace.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const rect = workspace.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const containerMouseX = (mouseX - this.translateX) / this.zoomLevel;
      const containerMouseY = (mouseY - this.translateY) / this.zoomLevel;

      if (e.deltaY < 0) {
        this.zoomLevel = Math.min(this.zoomLevel + 0.1, 2.0);
      } else {
        this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.15);
      }

      this.translateX = mouseX - containerMouseX * this.zoomLevel;
      this.translateY = mouseY - containerMouseY * this.zoomLevel;
      this.updateTransform();
    });

    // Pan / Dragging com o mouse
    workspace.addEventListener('mousedown', (e) => {
      if (e.target.closest('.btn') || e.target.closest('.btn-control') || e.target.closest('.btn-mini')) return;
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

    // Suporte a gestos touch para dispositivos móveis (arrastar para navegar e pinça para zoom)
    this.initialTouchDistance = null;
    this.initialZoom = 1;

    workspace.addEventListener('touchstart', (e) => {
      // Ignora toques em botões de interface
      if (e.target.closest('.btn') || e.target.closest('.btn-control') || e.target.closest('.btn-mini')) return;
      
      // Só inicia pan/pinch se o toque começa dentro do workspace da árvore
      const touchedInWorkspace = e.target.closest('.tree-workspace') !== null;

      if (e.touches.length === 2 && touchedInWorkspace) {
        this.isDragging = false;
        this.initialTouchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        this.initialZoom = this.zoomLevel;
        
        // Ponto central da pinça no início
        const touchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const touchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = workspace.getBoundingClientRect();
        this.pinchCenterX = touchX - rect.left;
        this.pinchCenterY = touchY - rect.top;
        this.containerPinchX = (this.pinchCenterX - this.translateX) / this.zoomLevel;
        this.containerPinchY = (this.pinchCenterY - this.translateY) / this.zoomLevel;
        e.preventDefault();
      } else if (e.touches.length === 1 && touchedInWorkspace) {
        this.isDragging = true;
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.touchStartTranslateX = this.translateX;
        this.touchStartTranslateY = this.translateY;
        this.touchHasMoved = false;
      } else {
        this.isDragging = false;
      }
    }, { passive: false });

    workspace.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this.initialTouchDistance) {
        e.preventDefault();
        const currentDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDistance / this.initialTouchDistance;
        this.zoomLevel = Math.min(Math.max(this.initialZoom * factor, 0.15), 2.0);

        // Zoom centrado no ponto da pinça
        this.translateX = this.pinchCenterX - this.containerPinchX * this.zoomLevel;
        this.translateY = this.pinchCenterY - this.containerPinchY * this.zoomLevel;
        this.updateTransform();
      } else if (e.touches.length === 1 && this.isDragging) {
        const dx = e.touches[0].clientX - this.touchStartX;
        const dy = e.touches[0].clientY - this.touchStartY;
        
        if (Math.hypot(dx, dy) > 8) {
          this.touchHasMoved = true;
        }

        if (this.touchHasMoved) {
          e.preventDefault();
          this.translateX = this.touchStartTranslateX + dx;
          this.translateY = this.touchStartTranslateY + dy;
          this.updateTransform();
        }
      }
    }, { passive: false });

    workspace.addEventListener('touchend', (e) => {
      this.isDragging = false;
      this.initialTouchDistance = null;
    });
  }

  zoomIn() {
    if (!this.container) return;
    const workspace = this.container.closest('.tree-workspace');
    if (workspace) {
      const rect = workspace.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const containerCenterX = (centerX - this.translateX) / this.zoomLevel;
      const containerCenterY = (centerY - this.translateY) / this.zoomLevel;
      this.zoomLevel = Math.min(this.zoomLevel + 0.1, 2.0);
      this.translateX = centerX - containerCenterX * this.zoomLevel;
      this.translateY = centerY - containerCenterY * this.zoomLevel;
    } else {
      this.zoomLevel = Math.min(this.zoomLevel + 0.1, 2.0);
    }
    this.updateTransform();
  }

  zoomOut() {
    if (!this.container) return;
    const workspace = this.container.closest('.tree-workspace');
    if (workspace) {
      const rect = workspace.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const containerCenterX = (centerX - this.translateX) / this.zoomLevel;
      const containerCenterY = (centerY - this.translateY) / this.zoomLevel;
      this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.15);
      this.translateX = centerX - containerCenterX * this.zoomLevel;
      this.translateY = centerY - containerCenterY * this.zoomLevel;
    } else {
      this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.15);
    }
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
    
    const workspaceWidth  = workspace.clientWidth;
    const workspaceHeight = workspace.clientHeight;
    if (workspaceWidth === 0) return;

    // .tree-container agora tem min-width: max-content, então seu offsetWidth
    // é exato o tamanho da árvore inteira no layout.
    const containerWidth = this.container.offsetWidth;
    if (containerWidth === 0) return;

    // Calcula zoom para caber na largura do workspace (deixando 10% de margem)
    const targetZoom = (containerWidth > workspaceWidth * 0.9)
      ? Math.max((workspaceWidth * 0.9) / containerWidth, 0.15)
      : 1.0;

    // Em vez de centralizar no "fundador" (que pode ser assimétrico e deixar 
    // a árvore deslocada para um lado), centralizamos no meio geométrico de toda a árvore.
    const treeLocalCenterX = containerWidth / 2;

    // translateX = workspace_center - center_local * targetZoom
    this.translateX = (workspaceWidth / 2) - (treeLocalCenterX * targetZoom);
    
    // Deixa uma margem no topo
    this.translateY = Math.max(20, workspaceHeight * 0.06);
    this.zoomLevel  = targetZoom;

    this.updateTransform();
    this.container.style.opacity = '1';
  }


  updateTransform() {
    if (this.container) {
      const workspace = this.container.closest('.tree-workspace');
      if (workspace) {
        const workspaceWidth = workspace.clientWidth;
        const workspaceHeight = workspace.clientHeight;
        const containerWidth = this.container.offsetWidth;
        const containerHeight = this.container.offsetHeight;

        // Só aplica clamping se o container já tem dimensões reais
        // (evita forçar translateX=80 durante o render inicial quando offsetWidth=0)
        if (containerWidth > 0 && containerHeight > 0) {
          const minVisible = 80;
          const minX = minVisible - (containerWidth * this.zoomLevel);
          const maxX = workspaceWidth - minVisible;
          const minY = minVisible - (containerHeight * this.zoomLevel);
          const maxY = workspaceHeight - minVisible;

          this.translateX = Math.min(Math.max(this.translateX, minX), maxX);
          this.translateY = Math.min(Math.max(this.translateY, minY), maxY);
        }
      }
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

    // Inicialização heurística inteligente baseada no domínio da família Minatel Bertonha
    family.members.forEach(m => {
      if (m.id === founder.id || (partner && m.id === partner.id)) return;

      const nameLower = (m.name || '').toLowerCase();
      const roleLower = (m.role || '').toLowerCase();

      // Avós (Geração 0) - Evitamos incluir bisavós (como José Minatel) nesta geração heurística
      if (nameLower.includes('aparecida') || nameLower.includes('abilio') || (nameLower.includes('minatel') && !nameLower.includes('josé') && !nameLower.includes('jose'))) {
        generationMap[m.id] = 0;
      }
      // Tios e Pais da família Bertonha (Geração 1)
      else if (nameLower.includes('bertonha') && (roleLower.includes('irmã') || roleLower.includes('irmão') || roleLower.includes('tio') || roleLower.includes('tia') || roleLower.includes('pai') || roleLower.includes('mãe'))) {
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
        n.width = n.type === 'couple' ? 2.0 : 1.0;
        return n.width;
      }
      
      let childrenWidthSum = 0;
      n.children.forEach((child, index) => {
        childrenWidthSum += measureNode(child);
        if (index < n.children.length - 1) {
          const nextChild = n.children[index + 1];
          // Espaçamento horizontal ultra compacto entre os irmãos e ramos
          const spacing = (child.children.length > 0 || nextChild.children.length > 0) ? 0.5 : 0.2;
          childrenWidthSum += spacing;
        }
      });
      
      const selfWidth = n.type === 'couple' ? 2.0 : 1.0;
      n.width = Math.max(selfWidth, childrenWidthSum);
      return n.width;
    }

    // Mede todas as raízes
    roots.forEach(root => measureNode(root));

    // Posicionamento recursivo top-down
    function positionNode(n, leftX) {
      const selfWidth = n.type === 'couple' ? 2.0 : 1.0;
      
      if (n.children.length === 0) {
        n.x = leftX + (n.width - selfWidth) / 2;
        return;
      }
      
      let childrenTotalWidth = 0;
      n.children.forEach((child, index) => {
        childrenTotalWidth += child.width;
        if (index < n.children.length - 1) {
          const nextChild = n.children[index + 1];
          const spacing = (child.children.length > 0 || nextChild.children.length > 0) ? 0.5 : 0.2;
          childrenTotalWidth += spacing;
        }
      });
      
      if (selfWidth >= childrenTotalWidth) {
        n.x = leftX + (n.width - selfWidth) / 2;
        
        let childLeftX = leftX + (n.width - childrenTotalWidth) / 2;
        n.children.forEach((child, index) => {
          positionNode(child, childLeftX);
          const nextChild = n.children[index + 1];
          const spacing = nextChild ? ((child.children.length > 0 || nextChild.children.length > 0) ? 0.5 : 0.2) : 0;
          childLeftX += child.width + spacing;
        });
      } else {
        n.x = leftX + (n.width - selfWidth) / 2;
        
        let childLeftX = leftX;
        n.children.forEach((child, index) => {
          positionNode(child, childLeftX);
          const nextChild = n.children[index + 1];
          const spacing = nextChild ? ((child.children.length > 0 || nextChild.children.length > 0) ? 0.5 : 0.2) : 0;
          childLeftX += child.width + spacing;
        });
      }
    }

    // Posiciona as raízes lado a lado
    let currentRootLeftX = 0;
    const rootSpacing = 0.5;
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
        xMap[node.members[1].id] = node.x + 1.0;
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
        const scale = 82; // 1 unidade = 82px (super compacto)
        const cardWidth = 76;
        const coupleWidth = 160; // 2 cards de 76px + 8px de gap
        const targetX = node.x * scale;

        if (prevNode) {
          const prevWidth = prevNode.type === 'couple' ? coupleWidth : cardWidth;
          const prevEndX = prevNode.x * scale + prevWidth;
          let marginLeft = targetX - prevEndX;
          if (marginLeft < 12) marginLeft = 12; // Espaçamento mínimo ultra compacto
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

    // Esconde enquanto calcula a posição correta (evita flash no canto superior esquerdo)
    this.container.style.opacity = '0';
    // Não chama updateTransform() aqui — centerOnFounder fará o posicionamento correto

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

    const getOffsetPos = (el) => {
      let x = 0;
      let y = 0;
      while (el && el !== this.container) {
        x += el.offsetLeft;
        y += el.offsetTop;
        el = el.offsetParent;
      }
      return { x, y };
    };

    const drawLine = (childId, parentId) => {
      const childCard = this.container.querySelector(`.tree-card[data-id="${childId}"]`);
      const parentCard = this.container.querySelector(`.tree-card[data-id="${parentId}"]`);
      if (childCard && parentCard) {
        const childPos = getOffsetPos(childCard);
        const parentPos = getOffsetPos(parentCard);

        const childX = childPos.x + childCard.offsetWidth / 2;
        const parentX = parentPos.x + parentCard.offsetWidth / 2;

        let childY, parentY;
        if (childPos.y > parentPos.y) {
          // O filho está abaixo do pai (orientação clássica top-down)
          childY = childPos.y;
          parentY = parentPos.y + parentCard.offsetHeight;
        } else {
          // O filho está acima do pai (orientação bottom-up)
          childY = childPos.y + childCard.offsetHeight;
          parentY = parentPos.y;
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
      badgeHtml = `<span class="badge-status deceased" title="In Memoriam">🕊️</span>`;
    } else if (member.status === 'pendente' || member.memberType === 'invite') {
      badgeHtml = `<span class="badge-status pending" title="Convite Pendente">⏳</span>`;
      miniActionsHtml += `<button class="btn-mini btn-resend-inv" title="Reenviar Convite" data-id="${member.id}">✉</button>`;
    }

    card.innerHTML = `
      ${badgeHtml}
      <div class="member-avatar-wrapper">
        <img src="${member.photo}" alt="${member.name}" class="member-avatar" onerror="this.src='${DEFAULT_SILHOUETTE}'">
        <span class="member-role-badge">${displayRole}</span>
        <div class="member-actions-mini">
          ${miniActionsHtml}
        </div>
      </div>
      <div class="member-info">
        <div class="member-name" title="${member.name}">${member.name}</div>
        <div class="member-dates">${datesText}</div>
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
      const handleAdd = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onAddRelativeClick) this.onAddRelativeClick(member);
      };
      addBtn.addEventListener('click', handleAdd);
      addBtn.addEventListener('touchend', handleAdd);
    }

    // Evento de clique no botão mini de reenviar convite
    const resendBtn = card.querySelector('.btn-resend-inv');
    if (resendBtn) {
      const handleResend = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.appInstance && window.appInstance.resendInvite) {
          window.appInstance.resendInvite(member);
        }
      };
      resendBtn.addEventListener('click', handleResend);
      resendBtn.addEventListener('touchend', handleResend);
    }

    return card;
  }
}

export default TreeRenderer;
