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
    // Eixo de crescimento da árvore: 'vertical' (gerações empilhadas de cima para
    // baixo), 'horizontal' (colunas) ou 'radial' (leque). O modo 'diagonal' (45°)
    // foi descontinuado — se estiver salvo, cai para 'vertical'.
    this.axis = localStorage.getItem('tree_axis') || 'vertical';
    if (this.axis === 'diagonal') {
      this.axis = 'vertical';
      localStorage.setItem('tree_axis', this.axis);
    }

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

  // Alterna entre layout Vertical e Horizontal (botão ⇄).
  toggleAxis() {
    // Sai do diagonal ou radial antes de alternar vertical/horizontal
    if (this.axis === 'diagonal' || this.axis === 'radial') {
      this.axis = this._prevAxis || 'vertical';
    }
    this.axis = this.axis === 'vertical' ? 'horizontal' : 'vertical';
    this._applyAxisChange();
  }

  // Botão único de visualização: alterna entre o layout normal e o Arco 🌳.
  // (O modo Diagonal 45° foi descontinuado por não escalar bem.)
  cycleViewMode() {
    if (this.axis === 'radial') {
      this.axis = this._prevAxis || 'vertical';
    } else {
      // Guarda o modo normal atual para restaurar ao sair do Arco
      this._prevAxis = this.axis;
      this.axis = 'radial';
    }
    this._applyAxisChange();
  }

  // Ativa/desativa o modo Radial em Arco diretamente (uso programático).
  toggleRadial() {
    if (this.axis === 'radial') {
      this.axis = this._prevAxis || 'vertical';
    } else {
      if (this.axis !== 'diagonal') this._prevAxis = this.axis;
      this.axis = 'radial';
    }
    this._applyAxisChange();
  }

  _applyAxisChange() {
    localStorage.setItem('tree_axis', this.axis);
    this.updateAxisButton();
    this.updateViewModeButton();
    if (this.currentFamily) {
      this.render(this.currentFamily);
    }
  }

  // Atualiza o botão ⇄ (Vertical / Horizontal).
  updateAxisButton() {
    const btn = document.getElementById('btn-toggle-layout');
    if (!btn) return;
    const isH = this.axis === 'horizontal';
    btn.textContent = '⇄';
    btn.title = isH
      ? 'Layout Horizontal — clique para Vertical'
      : 'Layout Vertical — clique para Horizontal';
  }

  // Atualiza o botão único de visualização (🌳 Arco), acendendo-o quando ativo.
  updateViewModeButton() {
    const btn = document.getElementById('btn-toggle-viewmode');
    if (!btn) return;
    const isRadial = this.axis === 'radial';
    btn.classList.toggle('active', isRadial);
    btn.textContent = '🌳';
    btn.title = isRadial
      ? 'Arco (radial) ativo — clique para voltar ao normal'
      : 'Ativar visualização em Arco (radial)';
  }

  centerOnFounder() {
    const workspace = this.container ? this.container.closest('.tree-workspace') : null;
    if (!workspace) return;
    
    const workspaceWidth  = workspace.clientWidth;
    const workspaceHeight = workspace.clientHeight;
    if (workspaceWidth === 0) return;

    // .tree-container agora tem min-width: max-content, então seu offsetWidth
    // é exato o tamanho da árvore inteira no layout.
    let containerWidth = this.container.offsetWidth;

    // Fallback para modo diagonal/radial: se o container ainda não reporta largura (race
    // condition de layout), tenta medir pelo canvas interno.
    const isAbs = this.axis === 'diagonal' || this.axis === 'radial';
    if (containerWidth === 0 && isAbs) {
      const canvas = this.container.querySelector('.tree-diagonal-canvas') || this.container.querySelector('.tree-radial-canvas');
      if (canvas) containerWidth = canvas.offsetWidth + 128; // +2×4rem de padding
    }

    // Garante que o container seja sempre revelado, mesmo sem largura mensurável.
    if (containerWidth === 0) {
      this.container.style.opacity = '1';
      return;
    }

    // Modo diagonal/radial: encaixa a ALTURA da árvore no workspace para todos os
    // andares ficarem visíveis; centraliza no fundador horizontalmente.
    if (isAbs) {
      const canvas = this.container.querySelector('.tree-diagonal-canvas') || this.container.querySelector('.tree-radial-canvas');
      if (!canvas) { this.container.style.opacity = '1'; return; }

      const canvasW = canvas.offsetWidth  || (containerWidth  > 128 ? containerWidth  - 128 : 400);
      const canvasH = canvas.offsetHeight || 400;
      const totalW  = canvasW + 128; // + 2×4rem de padding (esquerda + direita)
      const totalH  = canvasH + 128; // + 2×4rem de padding (topo + base)

      // Zoom baseado em altura: garante que todos os andares caibam verticalmente
      const fitZoomH = (workspaceHeight * 0.90) / totalH;
      const fitZoomW = (workspaceWidth  * 0.90) / totalW;
      // Usa o menor dos dois para caber em ambas as dimensões quando a árvore for compacta
      const targetZoom = Math.max(0.12, Math.min(1.0, Math.min(fitZoomH, fitZoomW * 1.5)));
      this.zoomLevel = targetZoom;

      // Vertical: margem simétrica (árvore centrada verticalmente)
      this.translateY = Math.max(8, (workspaceHeight - totalH * targetZoom) / 2);

      // Horizontal: centraliza no card do fundador (rootMember)
      const founderCard = this.container.querySelector('.tree-card.root-member');
      if (founderCard) {
        let left = 0, el = founderCard;
        while (el && el !== this.container) { left += el.offsetLeft; el = el.offsetParent; }
        const partnersDiv = founderCard.closest('.tree-node-partners');
        const coupleW = partnersDiv ? partnersDiv.offsetWidth : founderCard.offsetWidth;
        const founderCenterX = left + coupleW / 2;
        this.translateX = (workspaceWidth / 2) - founderCenterX * targetZoom;
      } else {
        this.translateX = (workspaceWidth - totalW * targetZoom) / 2;
      }

      this.updateTransform();
      this.container.style.opacity = '1';
      return;
    }

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
    this.container.style.padding = '';
    this.container.style.width = '';
    this.container.style.height = '';
    
    // Aplica a classe de eixo para o CSS reorganizar gerações em linhas (vertical)
    // ou colunas (horizontal).
    this.container.classList.toggle('tree-horizontal', this.axis === 'horizontal');
    this.container.classList.toggle('tree-diagonal', this.axis === 'diagonal');
    this.container.classList.toggle('tree-radial', this.axis === 'radial');
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
      // Segundo pai/mãe (filho biológico do casal): garante o vínculo nos dois lados
      if (m.parentId2) {
        const coParent = family.members.find(p => p.id === m.parentId2);
        if (coParent && !coParent.childrenIds.includes(m.id)) {
          coParent.childrenIds.push(m.id);
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

    // As gerações são derivadas puramente dos vínculos parentId/partnerId pela
    // propagação BFS abaixo — funciona para qualquer família, sem heurística
    // específica de nomes.
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

    if (this.axis === 'diagonal') {
      this.buildDiagonalDOM(family, generationMap, xMap);
    } else if (this.axis === 'radial') {
      this.buildRadialDOM(family);
    } else {
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

        // Aplica o espaçamento exato baseado na diferença de posição (node.x é a
        // coordenada no eixo transversal, em "slots" de card). No modo vertical isso
        // vira margem à esquerda; no horizontal, margem ao topo (gerações em colunas).
        if (this.axis === 'horizontal') {
          const scale = 100; // 1 slot = 100px na vertical
          const cardHeight = 92;
          const coupleHeight = 192; // 2 cards empilhados de 92px + 8px de gap
          const targetY = node.x * scale;

          if (prevNode) {
            const prevHeight = prevNode.type === 'couple' ? coupleHeight : cardHeight;
            const prevEndY = prevNode.x * scale + prevHeight;
            let marginTop = targetY - prevEndY;
            if (marginTop < 16) marginTop = 16;
            groupDiv.style.marginTop = `${marginTop}px`;
          } else {
            groupDiv.style.marginTop = `${targetY}px`;
          }
        } else {
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
        }

        levelContainer.appendChild(groupDiv);
        prevNode = node;
      });

      this.container.appendChild(levelContainer);
    });
    } // fim do bloco else (layouts em níveis)

    // Sincroniza os botões com o modo atual (importante na primeira carga)
    this.updateAxisButton();
    this.updateViewModeButton();

    // Esconde enquanto calcula a posição correta (evita flash no canto superior esquerdo)
    this.container.style.opacity = '0';
    // Não chama updateTransform() aqui — centerOnFounder fará o posicionamento correto

    // Desenha as conexões SVG dinâmicas após o navegador calcular o layout flexbox
    setTimeout(() => this.drawConnections(family), 100);
  }

  drawConnections(family) {
    if (!this.container) return;
    // O container já é position:absolute (via CSS), o que o mantém fora do fluxo
    // e serve de bloco de contenção para o SVG absoluto. Não o tornamos 'relative',
    // pois isso o devolveria ao fluxo com a altura NÃO escalada da árvore inteira,
    // esticando o workspace e empurrando os controles para fora da tela.
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

    // Desenha uma curva de filiação do cartão do filho até um "retângulo de origem"
    // (parentRect, em coordenadas de offset). Esse retângulo pode ser o de um único
    // pai/mãe OU o retângulo combinado de um casal — nesse caso a linha aponta para o
    // centro entre os dois, ligando o filho ao casal (filho biológico de ambos).
    const drawPathToRect = (childCard, parentRect) => {
      const childPos = getOffsetPos(childCard);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let pathD = '';

      if (this.axis === 'horizontal') {
        const childY = childPos.y + childCard.offsetHeight / 2;
        const parentY = parentRect.y + parentRect.height / 2;

        let childX, parentX;
        if (childPos.x > parentRect.x) {
          // Filho à direita do pai (esquerda → direita)
          childX = childPos.x;
          parentX = parentRect.x + parentRect.width;
        } else {
          // Filho à esquerda do pai (direita → esquerda)
          childX = childPos.x + childCard.offsetWidth;
          parentX = parentRect.x;
        }

        const midX = (childX + parentX) / 2;
        if (this.lineStyle === 'orthogonal') {
          pathD = `M ${parentX} ${parentY} L ${midX} ${parentY} L ${midX} ${childY} L ${childX} ${childY}`;
        } else {
          pathD = `M ${childX} ${childY} C ${midX} ${childY}, ${midX} ${parentY}, ${parentX} ${parentY}`;
        }
      } else if (this.axis === 'diagonal' || this.axis === 'radial') {
        const childCX = childPos.x + childCard.offsetWidth / 2;
        const parentCX = parentRect.x + parentRect.width / 2;
        let organicChildY, organicParentY;
        if (childPos.y > parentRect.y) {
          organicChildY = childPos.y;
          organicParentY = parentRect.y + parentRect.height;
        } else {
          organicChildY = childPos.y + childCard.offsetHeight;
          organicParentY = parentRect.y;
        }
        if (this.lineStyle === 'orthogonal') {
          // Estilo reto (botão ⚡): segmento direto entre pai e filho
          pathD = `M ${parentCX} ${organicParentY} L ${childCX} ${organicChildY}`;
        } else {
          // Curva cúbica: sai verticalmente do pai e chega verticalmente no filho,
          // criando o aspecto orgânico de galhos que se abrem.
          const dy = organicChildY - organicParentY;
          const cp1y = organicParentY + dy * 0.45;
          const cp2y = organicChildY - dy * 0.45;
          pathD = `M ${parentCX} ${organicParentY} C ${parentCX} ${cp1y}, ${childCX} ${cp2y}, ${childCX} ${organicChildY}`;
        }
      } else {
        const childX = childPos.x + childCard.offsetWidth / 2;
        const parentX = parentRect.x + parentRect.width / 2;

        let childY, parentY;
        if (childPos.y > parentRect.y) {
          // O filho está abaixo do pai (orientação clássica top-down)
          childY = childPos.y;
          parentY = parentRect.y + parentRect.height;
        } else {
          // O filho está acima do pai (orientação bottom-up)
          childY = childPos.y + childCard.offsetHeight;
          parentY = parentRect.y;
        }

        const midY = (childY + parentY) / 2;
        if (this.lineStyle === 'orthogonal') {
          pathD = `M ${parentX} ${parentY} L ${parentX} ${midY} L ${childX} ${midY} L ${childX} ${childY}`;
        } else {
          pathD = `M ${childX} ${childY} C ${childX} ${midY}, ${parentX} ${midY}, ${parentX} ${parentY}`;
        }
      }

      path.setAttribute('d', pathD);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#10b981'); // Verde Esmeralda brilhante
      path.setAttribute('stroke-width', '3');
      
      const isOrganic = this.axis === 'diagonal' || this.axis === 'radial';
      if (!isOrganic) {
        path.setAttribute('stroke-dasharray', '6,4'); // Tracejado elegante
      }
      path.style.filter = isOrganic
        ? 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.7))'
        : 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.5))';
      svg.appendChild(path);
    };

    const rectOf = (card) => {
      const pos = getOffsetPos(card);
      return { x: pos.x, y: pos.y, width: card.offsetWidth, height: card.offsetHeight };
    };

    // Liga o filho a UM pai/mãe (conexão genética simples / desassociada)
    const drawLine = (childId, parentId) => {
      const childCard = this.container.querySelector(`.tree-card[data-id="${childId}"]`);
      const parentCard = this.container.querySelector(`.tree-card[data-id="${parentId}"]`);
      if (childCard && parentCard) {
        drawPathToRect(childCard, rectOf(parentCard));
      }
    };

    // Liga o filho ao CASAL: a linha aponta para o centro entre os dois cartões dos pais
    const drawLineToCouple = (childId, parentAId, parentBId) => {
      const childCard = this.container.querySelector(`.tree-card[data-id="${childId}"]`);
      const cardA = this.container.querySelector(`.tree-card[data-id="${parentAId}"]`);
      const cardB = this.container.querySelector(`.tree-card[data-id="${parentBId}"]`);
      if (!childCard || !cardA || !cardB) return;
      const a = rectOf(cardA);
      const b = rectOf(cardB);
      // Retângulo combinado que abrange os dois pais; seu centro é o ponto do casal
      const combined = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
        height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y)
      };
      drawPathToRect(childCard, combined);
    };

    // Desenha conexões verticais de filiação de forma 100% dinâmica
    family.members.forEach(member => {
      if (member.parentId) {
        // Filho biológico do casal: tem o segundo pai/mãe E ambos os cartões existem
        const coParentCard = member.parentId2
          ? this.container.querySelector(`.tree-card[data-id="${member.parentId2}"]`)
          : null;
        if (coParentCard) {
          drawLineToCouple(member.id, member.parentId, member.parentId2);
        } else {
          drawLine(member.id, member.parentId);
        }
      }
    });

    // Vínculos de parceria entre cards renderizados em grupos separados
    // (ex.: segundo casamento). Dentro do mesmo grupo a linha já existe via CSS;
    // aqui desenhamos a união rosa para os pares que ficaram distantes.
    const partnerDrawn = new Set();
    family.members.forEach(member => {
      if (!member.partnerId || partnerDrawn.has(member.id)) return;
      const cardA = this.container.querySelector(`.tree-card[data-id="${member.id}"]`);
      const cardB = this.container.querySelector(`.tree-card[data-id="${member.partnerId}"]`);
      if (!cardA || !cardB) return;
      const groupA = cardA.closest('.tree-node-partners');
      const groupB = cardB.closest('.tree-node-partners');
      if (groupA && groupA === groupB) return;
      partnerDrawn.add(member.id);
      partnerDrawn.add(member.partnerId);

      const posA = getOffsetPos(cardA);
      const posB = getOffsetPos(cardB);
      const x1 = posA.x + cardA.offsetWidth / 2;
      const y1 = posA.y + 30;
      const x2 = posB.x + cardB.offsetWidth / 2;
      const y2 = posB.y + 30;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#ec4899');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke-dasharray', '4,4');
      path.style.filter = 'drop-shadow(0 0 4px rgba(236, 72, 153, 0.45))';
      svg.appendChild(path);
    });

    this.container.appendChild(svg);
    setTimeout(() => this.centerOnFounder(), 100);
    // Garantia final: se o container ainda estiver invisível após 600ms, revela
    const _container = this.container;
    setTimeout(() => {
      if (_container && _container.style.opacity !== '1') _container.style.opacity = '1';
    }, 600);
  }

  // Constrói o layout diagonal: cada cartão é posicionado absolutamente de forma
  // que as conexões entre pai e filho formem ângulos próximos de 45°.
  buildDiagonalDOM(family, generationMap, xMap) {
    // H_SCALE: distância horizontal por unidade de xMap.
    // Para dois casais adjacentes (2 unidades cada), o espaço entre eles é:
    //   2 × H_SCALE − (76+8+76) = 2 × H_SCALE − 160
    // Com H_SCALE = 110 o gap é ≈ 60px, pouco maior que um avatar (60px de diâmetro).
    const H_SCALE = 110;
    const V_SCALE = 170; // espaço vertical entre gerações

    const allX   = Object.values(xMap);
    const allGens = Object.values(generationMap);
    const minX   = Math.min(...allX);
    const maxX   = Math.max(...allX);
    const minGen = Math.min(...allGens);
    const maxGen = Math.max(...allGens);

    // Canvas com posição relativa serve de âncora para os cards absolutamente posicionados
    const canvas = document.createElement('div');
    canvas.className = 'tree-diagonal-canvas';
    canvas.style.position = 'relative';
    canvas.style.width  = `${Math.ceil((maxX - minX + 2) * H_SCALE) + 160}px`;
    canvas.style.height = `${(maxGen - minGen) * V_SCALE + 180}px`;

    const renderedIds = new Set();

    family.members.forEach(member => {
      if (renderedIds.has(member.id)) return;

      const gen = generationMap[member.id];

      // Posição Y respeita a orientação (top-down vs bottom-up)
      const genY = this.orientation === 'top-down'
        ? (gen - minGen) * V_SCALE
        : (maxGen - gen) * V_SCALE;

      // Procura cônjuge na mesma geração que ainda não foi renderizado
      const partnerMember = family.members.find(m => {
        if (renderedIds.has(m.id) || m.id === member.id) return false;
        const isPartner = m.id === member.partnerId ||
          member.partnerId === m.id ||
          (m.partnerId && m.partnerId === member.id);
        return isPartner && generationMap[m.id] === gen;
      });

      if (partnerMember) {
        // Casal: ordena pelo X para o card da esquerda sempre ser o primeiro
        const members = [member, partnerMember].sort((a, b) => xMap[a.id] - xMap[b.id]);
        const groupX  = (xMap[members[0].id] - minX) * H_SCALE;

        const groupDiv = document.createElement('div');
        groupDiv.style.position = 'absolute';
        groupDiv.style.left = `${groupX}px`;
        groupDiv.style.top  = `${genY}px`;

        const partnersDiv = document.createElement('div');
        partnersDiv.className = 'tree-node-partners';

        members.forEach(m => {
          partnersDiv.appendChild(this.createCard(m, family.rootMemberId));
          renderedIds.add(m.id);
        });

        groupDiv.appendChild(partnersDiv);
        canvas.appendChild(groupDiv);
      } else {
        // Membro solteiro: card posicionado diretamente no canvas
        const card = this.createCard(member, family.rootMemberId);
        card.style.position = 'absolute';
        card.style.left = `${(xMap[member.id] - minX) * H_SCALE}px`;
        card.style.top  = `${genY}px`;
        canvas.appendChild(card);
        renderedIds.add(member.id);
      }
    });

    this.container.appendChild(canvas);
  }

  // Constrói o layout em Arco (Radial): os nós se abrem em leque para cima ou para baixo
  // (definido pela orientação), proporcionalmente à ramificação de cada ramo.
  buildRadialDOM(family) {
    const CARD_W = 76;
    const CARD_H = 105;
    const ANCHOR_Y = 34; // distância do topo do card até o centro do avatar

    // Nós de layout: casais (e grupos com mais parceiros) são um único nó
    class LayoutNode {
      constructor(type, members) {
        this.type = type; // 'single' ou 'couple'
        this.members = members;
        this.children = [];
        this.parent = null;
        this.depth = 0;
        this.leaves = 1;
        this.angle = 0;
        this.a0 = 0;
        this.a1 = 0;
        this.px = 0;
        this.py = 0;
      }
      // n cards de 76px com 8px de gap entre eles
      get nodeWidth() { return this.members.length * 84 - 8; }
    }

    const nodes = [];
    const memberToNode = new Map();
    const visitedMembers = new Set();

    // Agrupa parceiros em um único nó, incluindo parceiros TRANSITIVOS:
    // num segundo casamento (A–B e A–C), os três viram um único grupo,
    // em vez de C ficar boiando fora da árvore sem conexão.
    family.members.forEach(m => {
      if (visitedMembers.has(m.id)) return;

      const group = [m];
      const inGroup = new Set([m.id]);
      const queue = [m];
      while (queue.length) {
        const cur = queue.pop();
        family.members.forEach(p => {
          if (inGroup.has(p.id) || visitedMembers.has(p.id)) return;
          if (p.partnerId === cur.id || cur.partnerId === p.id) {
            inGroup.add(p.id);
            group.push(p);
            queue.push(p);
          }
        });
      }

      // Com 3+ membros, o "hub" (quem tem mais vínculos de parceria) fica no meio
      if (group.length > 2) {
        const linkCount = (x) => group.filter(o => o !== x && (o.partnerId === x.id || x.partnerId === o.id)).length;
        group.sort((a, b) => linkCount(a) - linkCount(b));
        const hub = group.pop();
        group.splice(Math.floor(group.length / 2), 0, hub);
      }

      const node = new LayoutNode(group.length > 1 ? 'couple' : 'single', group);
      nodes.push(node);
      group.forEach(x => {
        memberToNode.set(x.id, node);
        visitedMembers.add(x.id);
      });
    });

    // Estabelece relações pai-filho entre os nós (protegido contra ciclos)
    nodes.forEach(node => {
      const parentId = node.members.map(x => x.parentId).find(Boolean) || null;
      if (!parentId) return;
      const parentNode = memberToNode.get(parentId);
      if (!parentNode || parentNode === node) return;

      let ancestor = parentNode;
      while (ancestor && ancestor !== node) ancestor = ancestor.parent;
      if (ancestor === node) return;

      node.parent = parentNode;
      if (!parentNode.children.includes(node)) {
        parentNode.children.push(node);
      }
    });

    // Ordena irmãos por data de nascimento (mais velho à esquerda)
    nodes.forEach(n => {
      n.children.sort((a, b) => {
        const da = a.members[0].birthDate || '9999';
        const db = b.members[0].birthDate || '9999';
        return da.localeCompare(db);
      });
    });

    const roots = nodes.filter(n => !n.parent);
    if (roots.length === 0) return;

    // Coloca o fundador/raiz principal no início
    let mainRoot = memberToNode.get(family.rootMemberId);
    while (mainRoot && mainRoot.parent) mainRoot = mainRoot.parent;
    const mainIdx = roots.indexOf(mainRoot);
    if (mainIdx > 0) {
      roots.splice(mainIdx, 1);
      roots.unshift(mainRoot);
    }

    // Calcula recursivamente o peso das ramificações (folhas)
    const countLeaves = (n) => {
      if (n.children.length === 0) {
        n.leaves = 1;
        return 1;
      }
      n.leaves = n.children.reduce((sum, c) => sum + countLeaves(c), 0);
      return n.leaves;
    };
    
    // Determina a profundidade de cada nível
    const setDepth = (n, d) => {
      n.depth = d;
      n.children.forEach(c => setDepth(c, d + 1));
    };

    // Distribui o ângulo do pai entre os filhos proporcionalmente à ramificação.
    // O peso usa a RAIZ QUADRADA das folhas: ramos pesados ainda abrem mais, mas
    // irmãos sem descendentes não ficam espremidos numa fatia mínima — o que
    // explodiria o raio do anel inteiro e deixaria a árvore esparsa demais.
    const assignAngles = (n, a0, a1) => {
      n.a0 = a0;
      n.a1 = a1;
      n.angle = (a0 + a1) / 2;
      if (n.children.length === 0) return;
      const weights = n.children.map(c => Math.sqrt(c.leaves));
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      let cursor = a0;
      n.children.forEach((c, i) => {
        const slice = (a1 - a0) * (weights[i] / totalWeight);
        assignAngles(c, cursor, cursor + slice);
        cursor += slice;
      });
    };

    // Direção de crescimento vertical (bottom-up cresce para cima, top-down para baixo)
    const grow = this.orientation === 'bottom-up' ? -1 : 1;

    const placedNodes = [];
    let treeOffsetX = 0;
    const TREE_GAP = 160;

    roots.forEach(root => {
      countLeaves(root);
      setDepth(root, 0);

      // Abertura da copa proporcional à ramificação. Um leque moderado (~155°)
      // mantém a raiz/tronco nítida embaixo com a primeira geração abrindo a copa,
      // sem espalhar demais nem forçar os anéis a crescerem muito no raio.
      const spread = Math.min(Math.PI * 1.14, Math.max(Math.PI / 5, root.leaves * (Math.PI / 6.5)));
      assignAngles(root, -spread / 2, spread / 2);

      const treeNodes = [];
      const stack = [root];
      while (stack.length) {
        const n = stack.pop();
        treeNodes.push(n);
        n.children.forEach(c => stack.push(c));
      }

      // Calcula os raios de cada nível de geração. O raio mínimo de um anel é
      // determinado pelos PARES DE VIZINHOS reais: a distância angular entre os
      // centros de dois nós adjacentes precisa comportar a metade de cada card
      // mais uma folga. Quando uma geração lotada exigiria um raio muito maior,
      // o anel é ESCALONADO: os nós alternam entre dois sub-raios (como folhas
      // num galho), o que dobra o espaço angular disponível e mantém a árvore
      // próxima do tronco.
      const siblingGap = 18;
      const vGap = 16;          // folga vertical entre cards
      const baseStep = 158;
      const staggerStep = 190;  // separação radial entre os dois sub-raios escalonados
      const maxDepth = Math.max(...treeNodes.map(n => n.depth));
      const ringOuter = [0]; // raio externo ocupado por cada anel

      // Raio mínimo para um par de cards adjacentes (mesmo raio) NÃO se sobrepor.
      // Os cards são retângulos alinhados ao eixo, então não colidem se a distância
      // HORIZONTAL ≥ (somatório das meias-larguras) OU a VERTICAL ≥ altura do card.
      // Como ambas as distâncias escalam com o raio, basta o menor raio que satisfaz
      // uma das duas condições — geometria exata, sem aproximação de arco.
      const pairRadius = (a, b) => {
        const dSin = Math.abs(Math.sin(b.angle) - Math.sin(a.angle));
        const dCos = Math.abs(Math.cos(b.angle) - Math.cos(a.angle));
        const needX = a.nodeWidth / 2 + b.nodeWidth / 2 + siblingGap;
        const needY = CARD_H + vGap;
        const rX = dSin > 1e-6 ? needX / dSin : Infinity;
        const rY = dCos > 1e-6 ? needY / dCos : Infinity;
        return Math.min(rX, rY);
      };

      for (let d = 1; d <= maxDepth; d++) {
        const ring = treeNodes
          .filter(n => n.depth === d)
          .sort((a, b) => a.angle - b.angle);
        const base = ringOuter[d - 1] + baseStep;

        // Raio mínimo para um círculo único onde NENHUM par (não só os vizinhos
        // imediatos) se sobreponha — perto do topo do leque, nós em ângulos quase
        // simétricos caem na mesma altura e precisam de folga horizontal.
        const flatRadiusAll = () => {
          let req = 0;
          for (let i = 0; i < ring.length; i++) {
            for (let j = i + 1; j < ring.length; j++) {
              req = Math.max(req, pairRadius(ring[i], ring[j]));
            }
          }
          return req;
        };

        const reqFlat = flatRadiusAll();
        if (reqFlat <= base || ring.length < 4) {
          // Cabe num círculo só — geometria exata garante zero sobreposição
          const r = Math.max(base, reqFlat);
          ring.forEach(n => { n.radius = r; });
          ringOuter[d] = r;
        } else {
          // Geração lotada: ESCALONA os nós em dois sub-raios (como folhas num
          // galho) para compactar. Cresce o raio até NENHUM par colidir — testando
          // TODOS os pares (inclusive entre sub-raios) com a geometria real dos
          // retângulos, o que evita casais largos se tocando perto das bordas.
          const assign = (rr) => ring.forEach((n, i) => { n.radius = rr + (i % 2) * staggerStep; });
          const clears = () => {
            for (let i = 0; i < ring.length; i++) {
              const a = ring[i];
              const ax = Math.sin(a.angle) * a.radius, ay = Math.cos(a.angle) * a.radius;
              for (let j = i + 1; j < ring.length; j++) {
                const b = ring[j];
                const bx = Math.sin(b.angle) * b.radius, by = Math.cos(b.angle) * b.radius;
                if (Math.abs(ax - bx) < (a.nodeWidth + b.nodeWidth) / 2 + siblingGap &&
                    Math.abs(ay - by) < CARD_H + vGap) return false;
              }
            }
            return true;
          };
          let r = base;
          assign(r);
          let guard = 0;
          while (!clears() && guard++ < 120) { r += 28; assign(r); }
          ringOuter[d] = r + staggerStep;
        }
      }

      // Converte coordenadas polares em cartesianas
      treeNodes.forEach(n => {
        const r = n.radius || 0;
        n.px = Math.sin(n.angle) * r;
        n.py = grow * Math.cos(n.angle) * r;
      });

      // Se houver múltiplas subárvores desconectadas, posiciona lado a lado
      let tMinX = Infinity, tMaxX = -Infinity;
      treeNodes.forEach(n => {
        tMinX = Math.min(tMinX, n.px - n.nodeWidth / 2);
        tMaxX = Math.max(tMaxX, n.px + n.nodeWidth / 2);
      });
      treeNodes.forEach(n => { n.px += treeOffsetX - tMinX; });
      treeOffsetX += (tMaxX - tMinX) + TREE_GAP;

      placedNodes.push(...treeNodes);
    });

    // Cria o canvas e normaliza coordenadas
    const canvas = document.createElement('div');
    canvas.className = 'tree-radial-canvas';
    canvas.style.position = 'relative';

    const PADDING = 100;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    placedNodes.forEach(n => {
      minX = Math.min(minX, n.px - n.nodeWidth / 2);
      maxX = Math.max(maxX, n.px + n.nodeWidth / 2);
      minY = Math.min(minY, n.py - ANCHOR_Y);
      maxY = Math.max(maxY, n.py - ANCHOR_Y + CARD_H);
    });

    const shiftX = PADDING - minX;
    const shiftY = PADDING - minY;
    canvas.style.width = `${(maxX - minX) + PADDING * 2}px`;
    canvas.style.height = `${(maxY - minY) + PADDING * 2}px`;

    // Renderiza cada nó (card individual ou casal) absolutamente posicionado
    placedNodes.forEach(node => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'tree-node-group';
      groupDiv.style.position = 'absolute';
      groupDiv.style.left = `${node.px + shiftX - node.nodeWidth / 2}px`;
      groupDiv.style.top = `${node.py + shiftY - ANCHOR_Y}px`;

      const partnersDiv = document.createElement('div');
      partnersDiv.className = 'tree-node-partners';
      node.members.forEach(m => partnersDiv.appendChild(this.createCard(m, family.rootMemberId)));
      groupDiv.appendChild(partnersDiv);

      canvas.appendChild(groupDiv);
    });

    this.container.appendChild(canvas);
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
