// Controlador Principal da Aplicação (App.js)

import AuthManager from './auth.js?v=20260518_09';
import StorageManager from './storage.js?v=20260518_09';
import FamilyManager from './family.js?v=20260518_09';
import ModalManager from './modal.js?v=20260518_09';
import TreeRenderer from './tree.js?v=20260518_09';
import supabaseAdapterInstance from './supabase.js?v=20260518_09';
import firebaseAdapterInstance from './firebase.js?v=20260518_09';

const DEFAULT_SILHOUETTE = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22%2394a3b8%22%3E%3Cpath%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E';

class App {
  constructor() {
    window.appInstance = this;
    this.currentUser = null;
    this.activeFamily = null;
    this.treeRenderer = null;
    this.selectedMemberForAdd = null;
    this.editingMember = null;
    this.pendingInviteCode = null;
    this.pendingMemberId = null;
    this.cropperInstance = null; // Instância do Cropper.js

    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  async init() {
    ModalManager.init();

    this.treeRenderer = new TreeRenderer('tree-container', 
      (member) => this.openEditMemberModal(member),
      (member) => this.openAddRelativeModal(member)
    );

    const urlParams = new URLSearchParams(window.location.search);
    const inviteParam = urlParams.get('invite');
    const memberParam = urlParams.get('memberId');
    if (inviteParam) {
      this.pendingInviteCode = inviteParam;
      this.pendingMemberId = memberParam || null;
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Inicializa Autenticação
    AuthManager.init((user) => this.onAuthStateChanged(user));

    // Configura Event Listeners Globais
    this.setupEventListeners();

    // Auto-configura Firebase por padrão se não houver configuração salva
    if (!localStorage.getItem('raizes_firebase_config')) {
      const defaultFirebaseConfig = {
        apiKey: "AIzaSyCXE1vJSroJJDFlOaFI7SmjQJr0OWj1kiQ",
        authDomain: "raizes-9e7b7.firebaseapp.com",
        projectId: "raizes-9e7b7",
        storageBucket: "raizes-9e7b7.firebasestorage.app",
        messagingSenderId: "764589881699",
        appId: "1:764589881699:web:c71286afc9ba572f137b56"
      };
      firebaseAdapterInstance.configure(defaultFirebaseConfig);
    } else {
      firebaseAdapterInstance.autoConnect();
    }

    if (supabaseAdapterInstance.isConfigured() || firebaseAdapterInstance.isConfigured()) {
      this.updateSupabaseUI();
      await StorageManager.syncFromSupabase();
      if (this.currentUser) {
        this.activeFamily = StorageManager.getActiveFamily();
        if (!this.activeFamily) {
          const families = StorageManager.getFamilies();
          if (families.length > 0) {
            StorageManager.setActiveFamily(families[0].id);
            this.activeFamily = families[0];
          }
        }
        if (this.activeFamily) {
          this.showScreen('dashboard-screen');
          this.renderTree();
        } else {
          this.showScreen('onboarding-screen');
        }
      }
    }
  }

  onAuthStateChanged(user) {
    this.currentUser = user;
    this.updateUserUI();

    if (!this.currentUser) {
      this.showScreen('login-screen');
      return;
    }

    if (this.pendingInviteCode) {
      const code = this.pendingInviteCode;
      const memId = this.pendingMemberId;
      this.pendingInviteCode = null;
      this.pendingMemberId = null;
      this.handleJoinFamily(code, memId);
      return;
    }

    this.activeFamily = StorageManager.getActiveFamily();
    if (!this.activeFamily) {
      const families = StorageManager.getFamilies();
      if (families.length > 0) {
        StorageManager.setActiveFamily(families[0].id);
        this.activeFamily = families[0];
      }
    }

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
        if (this.currentUser.photo && (this.currentUser.photo.includes('unsplash.com') || this.currentUser.photo.includes('<svg'))) {
          this.currentUser.photo = DEFAULT_SILHOUETTE;
          StorageManager.setCurrentUser(this.currentUser);
        }
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

  updateSupabaseUI() {
    const badge = document.getElementById('supabase-status-badge');

    if (firebaseAdapterInstance.isConfigured()) {
      if (badge) {
        badge.textContent = 'Online e Sincronizado';
        badge.style.background = '#15803d';
        badge.style.color = '#bbf7d0';
      }
    } else {
      if (badge) {
        badge.textContent = 'Não Configurado (Usando LocalStorage)';
        badge.style.background = '#ca8a04';
        badge.style.color = '#fef08a';
      }
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

      // Auto-linking / Auto-healing pass: Garante que pais/mães adicionados fiquem conectados corretamente ao membro raiz ou cônjuge
      if (this.activeFamily.members && this.activeFamily.members.length > 1) {
        let modified = false;
        const membersMap = new Map(this.activeFamily.members.map(m => [m.id, m]));
        const founder = membersMap.get(this.activeFamily.rootMemberId);
        const partner = this.activeFamily.members.find(m => m.role === 'Cônjuge' || m.partnerId === this.activeFamily.rootMemberId);
        
        // Encontra membros que são Pai/Mãe
        const parents = this.activeFamily.members.filter(m => m.role === 'Pai/Mãe' || m.role === 'Pai' || m.role === 'Mãe');
        
        parents.forEach(parent => {
          if (!parent.childrenIds) parent.childrenIds = [];
          
          // Lógica inteligente e determinística de vinculação:
          // Se o nome do pai/mãe contém "Bertonha" ou "Maciel" (sobrenomes do Danilo), ou se for o primeiro pai/mãe e o Danilo não tiver pai correto, vincula ao Danilo.
          // Caso contrário (ex: Aparecida Minatel), vincula à Bruna Miho (Cônjuge).
          let targetChild = null;
          const parentName = parent.name.toLowerCase();
          const isDaniloParent = parentName.includes('bertonha') || parentName.includes('maciel') || parentName.includes('lucia');
          
          if (isDaniloParent) {
            targetChild = founder;
          } else if (partner) {
            targetChild = partner;
          } else {
            targetChild = founder;
          }

          if (targetChild) {
            if (targetChild.parentId !== parent.id) {
              targetChild.parentId = parent.id;
              modified = true;
            }
            if (!parent.childrenIds.includes(targetChild.id)) {
              parent.childrenIds.push(targetChild.id);
              modified = true;
            }
          }
        });

        // Limpeza de inconsistências cruzadas (garante que um membro não esteja em childrenIds de um pai que não é o dele)
        parents.forEach(parent => {
          if (parent.childrenIds) {
            const validChildren = parent.childrenIds.filter(childId => {
              const child = membersMap.get(childId);
              return child && child.parentId === parent.id;
            });
            if (validChildren.length !== parent.childrenIds.length) {
              parent.childrenIds = validChildren;
              modified = true;
            }
          }
        });

        // Limpeza automática de fotos legadas do Unsplash ou SVGs corrompidos com aspas duplas (substituindo pela silhueta limpa URL-encoded)
        this.activeFamily.members.forEach(m => {
          if (m.photo && (m.photo.includes('unsplash.com') || m.photo.includes('<svg'))) {
            m.photo = DEFAULT_SILHOUETTE;
            modified = true;
          }
        });

        if (modified) {
          StorageManager.saveFamily(this.activeFamily);
        }
      }

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

    const btnLogout = document.getElementById('navbar-logout-btn');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        AuthManager.logout();
        ModalManager.showToast('Você saiu da conta.', 'success');
      });
    }

    // Botão de Status da Nuvem
    const btnSupabaseNav = document.getElementById('navbar-supabase-btn');
    if (btnSupabaseNav) {
      btnSupabaseNav.addEventListener('click', () => {
        this.updateSupabaseUI();
        ModalManager.openModal('modal-supabase');
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

    const formJoinFamily = document.getElementById('form-join-family');
    if (formJoinFamily) {
      formJoinFamily.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('input-invite-code').value;
        ModalManager.closeModal('modal-join-family');
        this.handleJoinFamily(code);
      });
    }

    const btnAddMember = document.getElementById('btn-dashboard-add-member');
    if (btnAddMember) {
      btnAddMember.addEventListener('click', () => {
        if (!this.activeFamily || !this.activeFamily.members.length) return;
        const rootMember = this.activeFamily.members.find(m => m.id === this.activeFamily.rootMemberId) || this.activeFamily.members[0];
        this.openAddRelativeModal(rootMember);
      });
    }

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

    const badgeCode = document.getElementById('badge-family-code');
    if (badgeCode) {
      badgeCode.addEventListener('click', () => {
        if (!this.activeFamily) return;
        if (btnInvite) btnInvite.click();
      });
    }

    const btnCopyLink = document.getElementById('btn-copy-invite-link');
    if (btnCopyLink) {
      btnCopyLink.addEventListener('click', () => {
        const input = document.getElementById('modal-invite-link-input');
        input.select();
        document.execCommand('copy');
        ModalManager.showToast('Link copiado para a área de transferência!', 'success');
      });
    }

    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.treeRenderer.zoomIn());

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.treeRenderer.zoomOut());

    const btnZoomReset = document.getElementById('btn-zoom-reset');
    if (btnZoomReset) btnZoomReset.addEventListener('click', () => this.treeRenderer.resetZoom());

    // Upload de Foto Local + Cropper.js
    const fileInput = document.getElementById('member-file-upload');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            this.openCropperModal(event.target.result);
          };
          reader.readAsDataURL(file);
          fileInput.value = ''; // Limpa input para permitir re-upload do mesmo arquivo
        }
      });
    }

    const btnOpenCropper = document.getElementById('btn-open-cropper');
    if (btnOpenCropper) {
      btnOpenCropper.addEventListener('click', () => {
        const currentSrc = document.getElementById('member-photo-preview').src;
        this.openCropperModal(currentSrc);
      });
    }

    // Controles do Cropper.js
    document.getElementById('btn-crop-zoom-in')?.addEventListener('click', (e) => { e.preventDefault(); this.cropperInstance?.zoom(0.1); });
    document.getElementById('btn-crop-zoom-out')?.addEventListener('click', (e) => { e.preventDefault(); this.cropperInstance?.zoom(-0.1); });
    document.getElementById('btn-crop-rotate')?.addEventListener('click', (e) => { e.preventDefault(); this.cropperInstance?.rotate(45); });
    document.getElementById('btn-crop-reset')?.addEventListener('click', (e) => { e.preventDefault(); this.cropperInstance?.reset(); });

    const btnConfirmCrop = document.getElementById('btn-confirm-crop');
    if (btnConfirmCrop) {
      btnConfirmCrop.addEventListener('click', () => {
        if (!this.cropperInstance) return;
        const canvas = this.cropperInstance.getCroppedCanvas({
          width: 300,
          height: 300,
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high',
        });

        if (canvas) {
          const croppedDataUrl = canvas.toDataURL('image/webp', 0.9);
          document.getElementById('member-photo-preview').src = croppedDataUrl;
          ModalManager.closeModal('modal-crop');
          ModalManager.showToast('Foto ajustada e recortada com sucesso!', 'success');
        }
      });
    }

    // Previews e Validação Inteligente de Links na Nuvem (Google Photos, OneDrive, iCloud)
    ['member-gphotos-url', 'member-onedrive-url', 'member-icloud-url'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', async (e) => {
          const url = e.target.value.trim();
          const warningBox = document.getElementById('cloud-warning-box');

          if (!url) {
            if (warningBox) warningBox.style.display = 'none';
            return;
          }

          // Verifica se é uma página web de compartilhamento do Google Photos
          const isGPhotosShare = url.includes('photos.app.goo.gl') || url.includes('photos.google.com/share');
          const isOtherShare = url.includes('1drv.ms') || url.includes('icloud.com/photos');

          if (isGPhotosShare) {
            if (warningBox) warningBox.style.display = 'none';
            ModalManager.showToast('Extraindo imagem do Google Photos...', 'success');
            
            try {
              // Utiliza proxy CORS público para extrair a tag og:image da página do Google Photos
              const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
              const response = await fetch(proxyUrl);
              const htmlText = await response.text();

              // Busca a tag og:image com regex
              const match = htmlText.match(/property="og:image" content="([^"]+)"/);
              if (match && match[1]) {
                let imgUrl = match[1];
                // Substitui os parâmetros de redimensionamento para obter a imagem em alta resolução e formato quadrado
                imgUrl = imgUrl.replace(/=w\d+-h\d+-[^"]+/g, '=w1000-h1000');
                
                document.getElementById('member-photo-preview').src = imgUrl;
                ModalManager.showToast('Foto importada! Clique em "Ajustar / Recortar Foto Atual" se desejar enquadrar.', 'success');
              } else {
                throw new Error('Tag og:image não encontrada na página.');
              }
            } catch (err) {
              console.error('Erro ao extrair Google Photos via Codetabs, tentando fallback...', err);
              // Fallback para AllOrigins caso o Codetabs falhe
              try {
                const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                const res = await fetch(fallbackUrl);
                const data = await res.json();
                const match = (data.contents || '').match(/property="og:image" content="([^"]+)"/);
                if (match && match[1]) {
                  let imgUrl = match[1].replace(/=w\d+-h\d+-[^"]+/g, '=w1000-h1000');
                  document.getElementById('member-photo-preview').src = imgUrl;
                  ModalManager.showToast('Foto importada! Clique em "Ajustar / Recortar Foto Atual" se desejar enquadrar.', 'success');

                } else {
                  if (warningBox) warningBox.style.display = 'block';
                  ModalManager.showToast('Não foi possível extrair a imagem automaticamente. Veja as instruções abaixo.', 'error');
                }
              } catch (fallbackErr) {
                if (warningBox) warningBox.style.display = 'block';
                ModalManager.showToast('Não foi possível extrair a imagem automaticamente. Veja as instruções abaixo.', 'error');
              }
            }
          } else if (isOtherShare) {
            if (warningBox) warningBox.style.display = 'block';
          } else if (url.startsWith('http://') || url.startsWith('https://')) {
            if (warningBox) warningBox.style.display = 'none';
            document.getElementById('member-photo-preview').src = url;
            ModalManager.showToast('Link de imagem direta vinculado!', 'success');
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

    const formMember = document.getElementById('form-member');
    if (formMember) {
      formMember.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveMember();
      });
    }

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
    document.getElementById('member-photo-preview').src = DEFAULT_SILHOUETTE;
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

    const cloudWarning = document.getElementById('cloud-warning-box');
    if (cloudWarning) cloudWarning.style.display = 'none';

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

    const cloudWarning = document.getElementById('cloud-warning-box');
    if (cloudWarning) cloudWarning.style.display = 'none';

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
        let childIdToLink = null;
        let role = relationship;

        if (relationship === 'Filho') {
          parentId = this.selectedMemberForAdd.id;
        } else if (relationship === 'Cônjuge') {
          partnerId = this.selectedMemberForAdd.id;
        } else if (relationship === 'Pai') {
          role = 'Pai/Mãe';
          childIdToLink = this.selectedMemberForAdd.id;
        } else if (relationship === 'Irmão') {
          parentId = this.selectedMemberForAdd.parentId;
        }

        const newMem = FamilyManager.addMember(this.activeFamily.id, {
          name, birthDate, deathDate, status: memberType === 'invite' ? 'pendente' : status, bio, photo, role, parentId, partnerId, childIdToLink, memberType
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

  openCropperModal(imageSrc) {
    const imageToCrop = document.getElementById('image-to-crop');
    imageToCrop.src = imageSrc;
    
    ModalManager.openModal('modal-crop');

    if (this.cropperInstance) {
      this.cropperInstance.destroy();
    }

    // Inicializa o Cropper após a imagem carregar no modal
    setTimeout(() => {
      this.cropperInstance = new Cropper(imageToCrop, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.8,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
      });
    }, 200);
  }
}

// Inicializa a aplicação
new App();
