// Controlador Principal da Aplicação (App.js)

import AuthManager from './auth.js';
import StorageManager from './storage.js';
import FamilyManager from './family.js';
import ModalManager from './modal.js';
import TreeRenderer from './tree.js';

class App {
  constructor() {
    window.appInstance = this;
    this.currentUser = null;
    this.activeFamily = null;
    this.treeRenderer = null;
    this.selectedMemberForAdd = null; // Membro selecionado ao clicar em "+"
    this.editingMember = null; // Membro em edição
    this.pendingInviteCode = null; // Código de convite pendente da URL ou input
    this.pendingMemberId = null; // ID de membro específico para vinculação de convite

    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  init() {
    // Inicializa modais
    ModalManager.init();

    // Inicializa renderizador da árvore
    this.treeRenderer = new TreeRenderer('tree-container', 
      (member) => this.openEditMemberModal(member),
      (member) => this.openAddRelativeModal(member)
    );

    // Verifica parâmetros de URL (Convite e MemberId)
    const urlParams = new URLSearchParams(window.location.search);
    const inviteParam = urlParams.get('invite');
    const memberParam = urlParams.get('memberId');
    if (inviteParam) {
      this.pendingInviteCode = inviteParam;
      this.pendingMemberId = memberParam || null;
      // Limpa a URL para ficar limpa
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Inicializa Autenticação
    AuthManager.init((user) => this.onAuthStateChanged(user));

    // Configura Event Listeners Globais
    this.setupEventListeners();
  }

  onAuthStateChanged(user) {
    this.currentUser = user;
    this.updateUserUI();

    if (!this.currentUser) {
      this.showScreen('login-screen');
      return;
    }

    // Se temos um convite pendente, processa-o com o memberId se houver
    if (this.pendingInviteCode) {
      const code = this.pendingInviteCode;
      const memId = this.pendingMemberId;
      this.pendingInviteCode = null;
      this.pendingMemberId = null;
      this.handleJoinFamily(code, memId);
      return;
    }

    // Carrega família ativa do usuário
    this.activeFamily = StorageManager.getActiveFamily();

    if (this.activeFamily) {
      this.showScreen('dashboard-screen');
      this.renderTree();
    } else {
      this.showScreen('onboarding-screen');
    }
  }

  updateUserUI() {
    const userProfileEl = document.getElementById('navbar-user-profile');
    const loginBtnEl = document.getElementById('navbar-login-btn');
    const logoutBtnEl = document.getElementById('navbar-logout-btn');

    if (this.currentUser) {
      if (userProfileEl) {
        userProfileEl.style.display = 'flex';
        const avatarEl = userProfileEl.querySelector('.user-avatar');
        const nameEl = userProfileEl.querySelector('.user-name');
        if (avatarEl) {
          avatarEl.innerHTML = `<img src="${this.currentUser.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
        if (nameEl) nameEl.textContent = this.currentUser.name;
      }
      if (loginBtnEl) loginBtnEl.style.display = 'none';
      if (logoutBtnEl) logoutBtnEl.style.display = 'inline-flex';
    } else {
      if (userProfileEl) userProfileEl.style.display = 'none';
      if (loginBtnEl) loginBtnEl.style.display = 'inline-flex';
      if (logoutBtnEl) logoutBtnEl.style.display = 'none';
    }
  }

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
  }

  renderTree() {
    if (this.activeFamily && this.treeRenderer) {
      document.getElementById('family-title-text').textContent = this.activeFamily.name;
      document.getElementById('family-code-text').textContent = this.activeFamily.code;
      this.treeRenderer.render(this.activeFamily);
    }
  }

  setupEventListeners() {
    // Botões de Login
    const btnGoogle = document.getElementById('btn-login-google');
    if (btnGoogle) {
      btnGoogle.addEventListener('click', () => {
        AuthManager.loginWithGoogle();
        ModalManager.showToast('Login realizado com sucesso!', 'success');
      });
    }

    const formEmail = document.getElementById('form-login-email');
    if (formEmail) {
      formEmail.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
          AuthManager.loginWithEmail(email, password);
          ModalManager.showToast('Login realizado com sucesso!', 'success');
        } catch (err) {
          ModalManager.showToast(err.message, 'error');
        }
      });
    }

    // Botão de Demonstração Interativa
    const btnDemo = document.getElementById('btn-demo');
    if (btnDemo) {
      btnDemo.addEventListener('click', () => {
        const demoUser = AuthManager.loginWithGoogle();
        const demoFamily = StorageManager.loadDemoFamily();
        this.activeFamily = demoFamily;
        this.showScreen('dashboard-screen');
        this.renderTree();
        ModalManager.showToast('Demonstração carregada com sucesso!', 'success');
      });
    }

    // Logout
    const btnLogout = document.getElementById('navbar-logout-btn');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        AuthManager.logout();
        ModalManager.showToast('Você saiu da conta.', 'success');
      });
    }

    // Onboarding Actions
    const cardCreate = document.getElementById('card-create-family');
    if (cardCreate) {
      cardCreate.addEventListener('click', () => {
        ModalManager.openModal('modal-create-family');
      });
    }

    const cardJoin = document.getElementById('card-join-family');
    if (cardJoin) {
      cardJoin.addEventListener('click', () => {
        ModalManager.openModal('modal-join-family');
      });
    }

    // Formulário Criar Família
    const formCreateFamily = document.getElementById('form-create-family');
    if (formCreateFamily) {
      formCreateFamily.addEventListener('submit', (e) => {
        e.preventDefault();
        const familyName = document.getElementById('input-family-name').value;
        try {
          const newFam = FamilyManager.createFamily(familyName, this.currentUser.name, this.currentUser.photo);
          this.activeFamily = newFam;
          ModalManager.closeModal('modal-create-family');
          this.showScreen('dashboard-screen');
          this.renderTree();
          ModalManager.showToast('Família criada com sucesso!', 'success');
        } catch (err) {
          ModalManager.showToast(err.message, 'error');
        }
      });
    }

    // Formulário Ingressar na Família
    const formJoinFamily = document.getElementById('form-join-family');
    if (formJoinFamily) {
      formJoinFamily.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('input-invite-code').value;
        ModalManager.closeModal('modal-join-family');
        this.handleJoinFamily(code);
      });
    }

    // Botão de Convite no Dashboard
    const btnInvite = document.getElementById('btn-dashboard-invite');
    if (btnInvite) {
      btnInvite.addEventListener('click', () => {
        if (!this.activeFamily) return;
        document.getElementById('modal-invite-code-text').textContent = this.activeFamily.code;
        document.getElementById('modal-invite-link-input').value = FamilyManager.getInviteLink(this.activeFamily.code);
        
        const btnWhats = document.getElementById('btn-share-whatsapp');
        const btnEmail = document.getElementById('btn-share-email');
        const newWhats = btnWhats.cloneNode(true);
        const newEmail = btnEmail.cloneNode(true);
        btnWhats.parentNode.replaceChild(newWhats, btnWhats);
        btnEmail.parentNode.replaceChild(newEmail, btnEmail);

        newWhats.addEventListener('click', () => {
          FamilyManager.shareViaWhatsApp(this.activeFamily.code, this.activeFamily.name);
        });
        newEmail.addEventListener('click', () => {
          FamilyManager.shareViaEmail(this.activeFamily.code, this.activeFamily.name);
        });

        ModalManager.openModal('modal-invite');
      });
    }

    // Código da Família (Clique para abrir convite)
    const badgeCode = document.getElementById('badge-family-code');
    if (badgeCode) {
      badgeCode.addEventListener('click', () => {
        if (!this.activeFamily) return;
        if (btnInvite) btnInvite.click();
      });
    }

    // Botão Copiar Link de Convite
    const btnCopyLink = document.getElementById('btn-copy-invite-link');
    if (btnCopyLink) {
      btnCopyLink.addEventListener('click', () => {
        const input = document.getElementById('modal-invite-link-input');
        input.select();
        document.execCommand('copy');
        ModalManager.showToast('Link copiado para a área de transferência!', 'success');
      });
    }

    // Controle de Zoom / Pan no Dashboard
    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.treeRenderer.zoomIn());

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.treeRenderer.zoomOut());

    const btnZoomReset = document.getElementById('btn-zoom-reset');
    if (btnZoomReset) btnZoomReset.addEventListener('click', () => this.treeRenderer.resetZoom());

    // Upload de Foto Local (FileReader)
    const fileInput = document.getElementById('member-file-upload');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            document.getElementById('member-photo-preview').src = event.target.result;
            ModalManager.showToast('Foto carregada com sucesso!', 'success');
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Previews de Links na Nuvem (Google Photos, OneDrive, iCloud)
    ['member-gphotos-url', 'member-onedrive-url', 'member-icloud-url'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('change', (e) => {
          const url = e.target.value.trim();
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            document.getElementById('member-photo-preview').src = url;
            ModalManager.showToast('Link de imagem vinculado!', 'success');
          }
        });
      }
    });

    // Toggle Tipo de Membro (Offline vs Convite)
    const typeCards = document.querySelectorAll('.member-type-card');
    const inviteAlert = document.getElementById('invite-alert-box');
    typeCards.forEach(card => {
      card.addEventListener('click', () => {
        typeCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const input = card.querySelector('input');
        if (input) input.checked = true;

        if (input && input.value === 'invite') {
          if (inviteAlert) inviteAlert.style.display = 'block';
        } else {
          if (inviteAlert) inviteAlert.style.display = 'none';
        }
      });
    });

    // Toggle Status de Vida (Vivo vs Falecido)
    const statusSelect = document.getElementById('member-status');
    const deathGroup = document.getElementById('group-member-death');
    if (statusSelect && deathGroup) {
      statusSelect.addEventListener('change', (e) => {
        if (e.target.value === 'falecido') {
          deathGroup.style.display = 'block';
        } else {
          deathGroup.style.display = 'none';
        }
      });
    }

    // Formulário Adicionar/Editar Membro
    const formMember = document.getElementById('form-member');
    if (formMember) {
      formMember.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveMember();
      });
    }

    // Ações de Conflito de Ingressão (Mesclar vs Aninhar)
    const cardMerge = document.getElementById('conflict-card-merge');
    const cardNest = document.getElementById('conflict-card-nest');
    if (cardMerge && cardNest) {
      cardMerge.addEventListener('click', () => {
        cardMerge.classList.add('selected');
        cardNest.classList.remove('selected');
      });
      cardNest.addEventListener('click', () => {
        cardNest.classList.add('selected');
        cardMerge.classList.remove('selected');
      });
    }

    const btnConfirmConflict = document.getElementById('btn-confirm-conflict');
    if (btnConfirmConflict) {
      btnConfirmConflict.addEventListener('click', () => {
        this.processConflictDecision();
      });
    }
  }

  handleJoinFamily(inviteCode, memberId = null) {
    if (!this.currentUser) {
      this.pendingInviteCode = inviteCode;
      this.pendingMemberId = memberId;
      this.showScreen('login-screen');
      ModalManager.showToast('Faça login para aceitar o convite.', 'success');
      return;
    }

    try {
      const currentFamily = StorageManager.getActiveFamily();
      const conflictResult = FamilyManager.checkJoinConflict(inviteCode, currentFamily);

      if (conflictResult.hasConflict) {
        document.getElementById('conflict-current-name').textContent = conflictResult.currentFamily.name;
        document.getElementById('conflict-current-count').textContent = `${conflictResult.currentFamily.members.length} membros`;
        document.getElementById('conflict-target-name').textContent = conflictResult.targetFamily.name;
        document.getElementById('conflict-target-count').textContent = `${conflictResult.targetFamily.members.length} membros`;
        
        const modal = document.getElementById('modal-join-conflict');
        modal.dataset.targetId = conflictResult.targetFamily.id;
        modal.dataset.sourceId = conflictResult.currentFamily.id;
        if (memberId) modal.dataset.memberId = memberId;

        ModalManager.openModal('modal-join-conflict');
      } else {
        if (memberId) {
          this.activeFamily = FamilyManager.linkUserToMember(conflictResult.targetFamily.id, memberId, this.currentUser);
          ModalManager.showToast(`Conta vinculada com sucesso na ${this.activeFamily.name}!`, 'success');
        } else {
          this.activeFamily = FamilyManager.joinFamilyDirectly(conflictResult.targetFamily.id);
          ModalManager.showToast(`Bem-vindo à ${this.activeFamily.name}!`, 'success');
        }
        this.showScreen('dashboard-screen');
        this.renderTree();
      }
    } catch (err) {
      ModalManager.showToast(err.message, 'error');
    }
  }

  processConflictDecision() {
    const modal = document.getElementById('modal-join-conflict');
    const targetFamilyId = modal.dataset.targetId;
    const sourceFamilyId = modal.dataset.sourceId;
    const memberId = modal.dataset.memberId || null;
    const isMerge = document.getElementById('conflict-card-merge').classList.contains('selected');

    try {
      if (isMerge) {
        this.activeFamily = FamilyManager.mergeFamilies(targetFamilyId, sourceFamilyId);
        if (memberId) {
          this.activeFamily = FamilyManager.linkUserToMember(targetFamilyId, memberId, this.currentUser);
        }
        ModalManager.showToast('Famílias mescladas com sucesso!', 'success');
      } else {
        const targetFamily = StorageManager.getFamilies().find(f => f.id === targetFamilyId);
        this.activeFamily = FamilyManager.nestFamily(targetFamilyId, sourceFamilyId, targetFamily.rootMemberId);
        if (memberId) {
          this.activeFamily = FamilyManager.linkUserToMember(targetFamilyId, memberId, this.currentUser);
        }
        ModalManager.showToast('Família conectada como subfamília!', 'success');
      }

      ModalManager.closeModal('modal-join-conflict');
      this.showScreen('dashboard-screen');
      this.renderTree();
    } catch (err) {
      ModalManager.showToast(err.message, 'error');
    }
  }

  openAddRelativeModal(member) {
    this.selectedMemberForAdd = member;
    this.editingMember = null;

    document.getElementById('modal-member-title').textContent = `Adicionar Parente de ${member.name}`;
    document.getElementById('member-name').value = '';
    document.getElementById('member-birth').value = '';
    document.getElementById('member-death').value = '';
    document.getElementById('member-bio').value = '';
    document.getElementById('member-photo-preview').src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';
    document.getElementById('member-file-upload').value = '';
    document.getElementById('member-gphotos-url').value = '';
    document.getElementById('member-onedrive-url').value = '';
    document.getElementById('member-icloud-url').value = '';

    const typeOffline = document.getElementById('type-offline-card');
    const typeInvite = document.getElementById('type-invite-card');
    if (typeOffline && typeInvite) {
      typeOffline.classList.add('active');
      typeInvite.classList.remove('active');
      typeOffline.querySelector('input').checked = true;
    }
    const inviteAlert = document.getElementById('invite-alert-box');
    if (inviteAlert) inviteAlert.style.display = 'none';

    const statusSelect = document.getElementById('member-status');
    if (statusSelect) statusSelect.value = 'vivo';
    const deathGroup = document.getElementById('group-member-death');
    if (deathGroup) deathGroup.style.display = 'none';

    const memberTypeSection = document.getElementById('member-type-section');
    if (memberTypeSection) memberTypeSection.style.display = 'block';

    const relSelect = document.getElementById('member-relationship');
    relSelect.innerHTML = `
      <option value="Filho">Filho / Filha</option>
      <option value="Cônjuge">Cônjuge / Parceiro(a)</option>
      <option value="Pai">Pai / Mãe</option>
      <option value="Irmão">Irmão / Irmã</option>
    `;

    ModalManager.openModal('modal-member');
  }

  openEditMemberModal(member) {
    this.editingMember = member;
    this.selectedMemberForAdd = null;

    document.getElementById('modal-member-title').textContent = `Editar ${member.name}`;
    document.getElementById('member-name').value = member.name;
    document.getElementById('member-birth').value = member.birthDate || '';
    document.getElementById('member-death').value = member.deathDate || '';
    document.getElementById('member-bio').value = member.bio || '';
    document.getElementById('member-photo-preview').src = member.photo;
    document.getElementById('member-file-upload').value = '';
    document.getElementById('member-gphotos-url').value = '';
    document.getElementById('member-onedrive-url').value = '';
    document.getElementById('member-icloud-url').value = '';

    const memberTypeSection = document.getElementById('member-type-section');
    if (memberTypeSection) memberTypeSection.style.display = 'none';
    const inviteAlert = document.getElementById('invite-alert-box');
    if (inviteAlert) inviteAlert.style.display = 'none';

    const statusSelect = document.getElementById('member-status');
    const deathGroup = document.getElementById('group-member-death');
    if (statusSelect && deathGroup) {
      statusSelect.value = member.status || 'vivo';
      deathGroup.style.display = member.status === 'falecido' ? 'block' : 'none';
    }

    const relSelect = document.getElementById('member-relationship');
    relSelect.innerHTML = `<option value="${member.role}">${member.role}</option>`;

    ModalManager.openModal('modal-member');
  }

  saveMember() {
    if (!this.activeFamily) return;

    const name = document.getElementById('member-name').value.trim();
    const birthDate = document.getElementById('member-birth').value;
    const deathDate = document.getElementById('member-death').value;
    const status = document.getElementById('member-status').value;
    const bio = document.getElementById('member-bio').value.trim();
    const photo = document.getElementById('member-photo-preview').src;
    const relationship = document.getElementById('member-relationship').value;

    const memberTypeEl = document.querySelector('input[name="member-type"]:checked');
    const memberType = memberTypeEl ? memberTypeEl.value : 'offline';

    if (!name) {
      ModalManager.showToast('O nome é obrigatório.', 'error');
      return;
    }

    try {
      if (this.editingMember) {
        FamilyManager.updateMember(this.activeFamily.id, {
          id: this.editingMember.id,
          name, birthDate, deathDate, status, bio, photo
        });
        ModalManager.showToast('Membro atualizado com sucesso!', 'success');
      } else if (this.selectedMemberForAdd) {
        let parentId = null;
        let partnerId = null;
        let role = relationship;

        if (relationship === 'Filho') {
          parentId = this.selectedMemberForAdd.id;
        } else if (relationship === 'Cônjuge') {
          partnerId = this.selectedMemberForAdd.id;
        } else if (relationship === 'Pai') {
          role = 'Pai/Mãe';
        } else if (relationship === 'Irmão') {
          parentId = this.selectedMemberForAdd.parentId;
        }

        const newMem = FamilyManager.addMember(this.activeFamily.id, {
          name, birthDate, deathDate, status: memberType === 'invite' ? 'pendente' : status, bio, photo, role, parentId, partnerId, memberType
        });

        if (memberType === 'invite') {
          ModalManager.showToast('Convite pendente criado! Compartilhe o link abaixo com o familiar.', 'success');
          setTimeout(() => {
            this.resendInvite(newMem);
          }, 500);
        } else {
          ModalManager.showToast('Parente adicionado com sucesso!', 'success');
        }
      }

      ModalManager.closeModal('modal-member');
      this.activeFamily = StorageManager.getActiveFamily();
      this.renderTree();
    } catch (err) {
      ModalManager.showToast(err.message, 'error');
    }
  }

  resendInvite(member) {
    if (!this.activeFamily) return;
    document.getElementById('modal-invite-code-text').textContent = this.activeFamily.code;
    document.getElementById('modal-invite-link-input').value = FamilyManager.getInviteLink(this.activeFamily.code, member.id);
    
    const btnWhats = document.getElementById('btn-share-whatsapp');
    const btnEmail = document.getElementById('btn-share-email');
    
    const newWhats = btnWhats.cloneNode(true);
    const newEmail = btnEmail.cloneNode(true);
    btnWhats.parentNode.replaceChild(newWhats, btnWhats);
    btnEmail.parentNode.replaceChild(newEmail, btnEmail);

    newWhats.addEventListener('click', () => {
      FamilyManager.shareViaWhatsApp(this.activeFamily.code, this.activeFamily.name, member.id, member.name);
    });
    newEmail.addEventListener('click', () => {
      FamilyManager.shareViaEmail(this.activeFamily.code, this.activeFamily.name, member.id, member.name);
    });

    ModalManager.openModal('modal-invite');
  }
}

// Inicializa a aplicação
new App();
