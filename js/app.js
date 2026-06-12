// Controlador Principal da Aplicação (App.js)

import AuthManager from './auth.js?v=20260607_02';
import StorageManager from './storage.js?v=20260607_02';
import FamilyManager from './family.js?v=20260607_02';
import ModalManager from './modal.js?v=20260607_02';
import TreeRenderer from './tree.js?v=20260612_03';
import supabaseAdapterInstance from './supabase.js?v=20260607_02';
import firebaseAdapterInstance from './firebase.js?v=20260607_02';

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

    window.debugDeleteClick = () => this.handleDeleteClick();

    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  showDebug(msg) {
    const el = document.getElementById('debug-status');
    if (el) {
      el.style.display = 'block';
      el.textContent = msg;
      setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
    console.log('[DEBUG]', msg);
  }

  handleDeleteClick() {
    this.showDebug(`🗑️ Delete clicado! editingMember: ${this.editingMember?.name || 'NULO'}`);
    if (!this.editingMember || !this.activeFamily) {
      this.showDebug('❌ Dados insuficientes para excluir');
      return;
    }
    const confirmed = confirm(`Tem certeza que deseja excluir ${this.editingMember.name}?`);
    if (confirmed) {
      this.showDebug('✅ Usuário confirmou exclusão');
      const deletedName = this.editingMember.name;
      const deletedId = this.editingMember.id;
      FamilyManager.deleteMember(this.activeFamily.id, this.editingMember.id);
      this.recordAudit('excluiu', { id: deletedId, name: deletedName });
      ModalManager.showToast('Membro excluído!', 'success');
      ModalManager.closeModal('modal-member');
      this.activeFamily = StorageManager.getActiveFamily();
      this.renderTree();
    } else {
      this.showDebug('❌ Usuário cancelou');
    }
  }

  async init() {
    console.log('[DEBUG] App.init() called');
    ModalManager.init();

    // Restaura o tema de fundo (claro/escuro) salvo pelo usuário
    this.applyTheme(localStorage.getItem('raizes_theme') || 'dark');

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

    // Configura Event Listeners Globais
    this.setupEventListeners();

    // Configura o Firebase PRIMEIRO (Firestore + Authentication), pois a assinatura
    // do estado de login depende de o Auth já estar inicializado.
    const defaultFirebaseConfig = {
      apiKey: "AIzaSyCXE1vJSroJJDFlOaFI7SmjQJr0OWj1kiQ",
      authDomain: "raizes-9e7b7.firebaseapp.com",
      projectId: "raizes-9e7b7",
      storageBucket: "raizes-9e7b7.firebasestorage.app",
      messagingSenderId: "764589881699",
      appId: "1:764589881699:web:c71286afc9ba572f137b56"
    };

    let firebaseConfigured = false;
    if (localStorage.getItem('raizes_firebase_config')) {
      firebaseConfigured = firebaseAdapterInstance.autoConnect();
    }

    if (!firebaseConfigured || !firebaseAdapterInstance.isConfigured()) {
      try {
        firebaseAdapterInstance.configure(defaultFirebaseConfig);
      } catch (err) {
        console.error('Erro na auto-configuração inicial do Firebase:', err);
      }
    }

    this.updateSupabaseUI();

    // Agora assina a autenticação real. O callback dirige todo o fluxo de telas e
    // dispara o carregamento dos dados da nuvem somente quando há um usuário logado.
    AuthManager.init((user) => this.onAuthStateChanged(user));
  }

  async onAuthStateChanged(user) {
    this.currentUser = user;
    this.updateUserUI();

    if (!this.currentUser) {
      this.activeFamily = null;
      this.refreshHistoryButton();
      this.showScreen('login-screen');
      return;
    }

    // Logado: carrega os dados da nuvem
    try {
      await StorageManager.syncFromSupabase();
    } catch (e) {
      console.warn('Falha ao sincronizar dados da nuvem:', e);
    }

    // Convite pendente tem prioridade sobre a família ativa
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
      this.refreshHistoryButton();
      this.maybePromptChooseCard();
    } else {
      this.refreshHistoryButton();
      this.showScreen('onboarding-screen');
    }
  }

  // ============ Identidade / dono da família ============
  isOwner(family) {
    if (!family || !this.currentUser) return false;
    if (family.ownerUserId) return family.ownerUserId === this.currentUser.id;
    // Família sem dono definido: quem está vinculado ao card raiz é considerado dono.
    const root = (family.members || []).find(m => m.id === family.rootMemberId);
    return !!(root && root.linkedUserId && root.linkedUserId === this.currentUser.id);
  }

  // Retorna o card vinculado à conta logada nesta família (ou null)
  getMyCard(family) {
    if (!family || !this.currentUser) return null;
    return (family.members || []).find(m => m.linkedUserId === this.currentUser.id) || null;
  }

  // ============ Formulário de e-mail: alterna Entrar / Criar conta ============
  setEmailFormMode(mode) {
    this.emailFormMode = mode;
    const nameGroup = document.getElementById('group-login-name');
    const submitBtn = document.querySelector('#form-login-email button[type="submit"]');
    const toggle = document.getElementById('link-toggle-register');
    if (nameGroup) nameGroup.style.display = mode === 'register' ? 'block' : 'none';
    if (submitBtn) submitBtn.textContent = mode === 'register' ? 'Criar conta' : 'Entrar com E-mail';
    if (toggle) toggle.textContent = mode === 'register' ? 'Já tenho conta — Entrar' : 'Não tem conta? Criar conta';
  }

  // ============ Registro de atividades (auditoria) ============
  recordAudit(action, target = {}) {
    try {
      if (!this.currentUser || !this.activeFamily) return;
      firebaseAdapterInstance.logAudit({
        familyId: this.activeFamily.id,
        userId: this.currentUser.id,
        userName: this.currentUser.name,
        action,
        targetId: target.id || null,
        targetName: target.name || '',
        details: target.details || ''
      });
    } catch (e) { /* auditoria é best-effort */ }
  }

  refreshHistoryButton() {
    const btn = document.getElementById('navbar-history-btn');
    if (!btn) return;
    btn.style.display = this.isOwner(this.activeFamily) ? 'inline-flex' : 'none';
  }

  async openHistoryModal() {
    if (!this.activeFamily) return;
    const listEl = document.getElementById('history-list');
    if (listEl) listEl.innerHTML = '<p style="color: var(--text-muted);">Carregando histórico...</p>';
    ModalManager.openModal('modal-history');
    const rows = await firebaseAdapterInstance.loadAudit(this.activeFamily.id);
    if (!listEl) return;
    if (!rows.length) {
      listEl.innerHTML = '<p style="color: var(--text-muted);">Nenhuma atividade registrada ainda.</p>';
      return;
    }
    listEl.innerHTML = rows.map(r => {
      const when = r.at ? new Date(r.at).toLocaleString('pt-BR') : '';
      const alvo = r.targetName ? ` <strong>${this._esc(r.targetName)}</strong>` : '';
      const det = r.details ? ` <span style="color: var(--text-muted);">(${this._esc(r.details)})</span>` : '';
      return `<div style="padding: 0.6rem 0; border-bottom: 1px solid var(--border-glass);">
        <div style="font-size: 0.9rem;"><strong>${this._esc(r.userName || 'Alguém')}</strong> ${this._esc(r.action)}${alvo}${det}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${when}</div>
      </div>`;
    }).join('');
  }

  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ============ Escolher seu card ao entrar na família ============
  maybePromptChooseCard() {
    if (!this.activeFamily || !this.currentUser) return;
    // Já vinculado nesta família? então não pergunta.
    if (this.getMyCard(this.activeFamily)) return;
    // Backfill de dono p/ famílias antigas: se sou o card raiz vinculado, viro dono.
    // (só roda se já houver vínculo; aqui ainda não há, então segue para a escolha.)
    this.openChooseCardModal();
  }

  openChooseCardModal() {
    const fam = this.activeFamily;
    const listEl = document.getElementById('choose-card-list');
    if (!listEl || !fam) return;

    // Lista membros ainda não vinculados a nenhuma conta
    const candidates = (fam.members || []).filter(m => !m.linkedUserId);
    if (candidates.length === 0) {
      // Nada para escolher — não incomoda o usuário
      return;
    }

    listEl.innerHTML = candidates.map(m => `
      <button type="button" class="choose-card-item btn btn-secondary" data-id="${this._esc(m.id)}"
        style="display:flex; align-items:center; gap:0.75rem; width:100%; justify-content:flex-start; margin-bottom:0.5rem; padding:0.6rem 0.9rem;">
        <img src="${this._esc(m.photo || DEFAULT_SILHOUETTE)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
        <span style="text-align:left;"><strong>${this._esc(m.name)}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">${this._esc(m.role || '')}</span></span>
      </button>
    `).join('');

    listEl.querySelectorAll('.choose-card-item').forEach(btn => {
      btn.addEventListener('click', () => this.handleChooseCard(btn.dataset.id));
    });

    ModalManager.openModal('modal-choose-card');
  }

  handleChooseCard(memberId) {
    try {
      const member = this.activeFamily.members.find(m => m.id === memberId);
      FamilyManager.chooseCard(this.activeFamily.id, memberId, this.currentUser);
      this.activeFamily = StorageManager.getActiveFamily();
      this.recordAudit('vinculou-se ao card', { id: memberId, name: member ? member.name : '' });
      ModalManager.closeModal('modal-choose-card');
      ModalManager.showToast('Card vinculado à sua conta!', 'success');
      this.renderTree();
      this.refreshHistoryButton();
    } catch (err) {
      ModalManager.showToast(err.message, 'error');
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

  applyTheme(theme) {
    const isLight = theme === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    localStorage.setItem('raizes_theme', isLight ? 'light' : 'dark');
    const btn = document.getElementById('btn-toggle-theme');
    if (btn) {
      btn.textContent = isLight ? '🌙' : '🌗';
      btn.title = isLight ? 'Ativar Tema Escuro' : 'Ativar Tema Claro';
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    this.applyTheme(current === 'light' ? 'dark' : 'light');
  }

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');

    // "Sair desta família" só faz sentido na árvore, com uma família ativa
    const btnLeaveFamily = document.getElementById('navbar-leave-family-btn');
    if (btnLeaveFamily) {
      btnLeaveFamily.style.display = (screenId === 'dashboard-screen' && this.activeFamily) ? 'inline-flex' : 'none';
    }
  }

  handleLeaveFamily() {
    if (!this.activeFamily) return;
    const fam = this.activeFamily;
    const confirmed = confirm(
      `Deseja sair da família "${fam.name}"?\n\n` +
      `Ela deixará de aparecer na sua conta neste aparelho. Isso NÃO altera a árvore para os outros membros, ` +
      `e você pode voltar quando quiser usando o código ${fam.code}.`
    );
    if (!confirmed) return;

    this.recordAudit('saiu da família', { name: fam.name });
    StorageManager.leaveFamily(fam.id);
    ModalManager.showToast(`Você saiu da família "${fam.name}".`, 'success');

    // Seleciona outra família restante ou volta ao onboarding
    const remaining = StorageManager.getFamilies();
    if (remaining.length > 0) {
      StorageManager.setActiveFamily(remaining[0].id);
      this.activeFamily = StorageManager.getActiveFamily();
      this.showScreen('dashboard-screen');
      this.renderTree();
    } else {
      this.activeFamily = null;
      this.showScreen('onboarding-screen');
    }
  }

  renderTree() {
    if (this.activeFamily && this.treeRenderer) {
      document.getElementById('family-title-text').textContent = this.activeFamily.name;
      document.getElementById('family-code-text').textContent = this.activeFamily.code;

      // Auto-healing / Correção Cirúrgica de Dados Específicos
      if (this.activeFamily.members && this.activeFamily.members.length > 1) {
        let modified = false;
        const membersMap = new Map(this.activeFamily.members.map(m => [m.id, m]));
        
        // 1. Localiza os familiares da família Minatel Bertonha
        const danilo = this.activeFamily.members.find(m => m.id === 'mem_1779128298378' || (m.name && m.name.includes('Danilo') && m.name.includes('Maciel')));
        const bruna = this.activeFamily.members.find(m => m.id === 'mem_1779132818275_qrj1f' || (m.name && m.name.includes('Bruna') && m.name.includes('Miho')));
        const theo = this.activeFamily.members.find(m => m.id === 'mem_1779147209590_ve62w' || (m.name && m.name.includes('Theo') && m.name.includes('Ryu')));
        const mae = this.activeFamily.members.find(m => m.id === 'mem_1779147405702_d8hbw' || (m.name && m.name.includes('Maria') && m.name.includes('Lucia') && m.name.includes('Bertonha')));
        const avo = this.activeFamily.members.find(m => m.id === 'mem_1779147493182_5drsp' || (m.name && m.name.includes('Aparecida') && m.name.includes('Minatel')));

        // 2. Garante que childrenIds sejam sempre arrays válidos
        this.activeFamily.members.forEach(m => {
          if (!m.childrenIds || !Array.isArray(m.childrenIds)) {
            m.childrenIds = [];
          }
        });

        // 3. Corrige Danilo: filho de Maria Lucia, parceiro de Bruna, pai de Theo
        if (danilo) {
          if (mae && danilo.parentId !== mae.id) {
            danilo.parentId = mae.id;
            modified = true;
          }
          if (bruna && danilo.partnerId !== bruna.id) {
            danilo.partnerId = bruna.id;
            modified = true;
          }
          if (theo && !danilo.childrenIds.includes(theo.id)) {
            danilo.childrenIds.push(theo.id);
            modified = true;
          }
        }

        // 4. Corrige Bruna: sem parentId direto no tronco central, parceira de Danilo, mãe de Theo
        if (bruna) {
          if (bruna.parentId !== null) {
            bruna.parentId = null;
            modified = true;
          }
          if (danilo && bruna.partnerId !== danilo.id) {
            bruna.partnerId = danilo.id;
            modified = true;
          }
          if (theo && !bruna.childrenIds.includes(theo.id)) {
            bruna.childrenIds.push(theo.id);
            modified = true;
          }
        }

        // 5. Corrige Theo: filho biológico do CASAL Danilo + Bruna (liga aos dois)
        if (theo) {
          if (danilo && theo.parentId !== danilo.id) {
            theo.parentId = danilo.id;
            modified = true;
          }
          if (bruna && theo.parentId2 !== bruna.id) {
            theo.parentId2 = bruna.id;
            modified = true;
          }
        }

        // 6. Corrige Maria Lucia (mãe): filha de Aparecida, mãe de Danilo
        if (mae) {
          if (avo && mae.parentId !== avo.id) {
            mae.parentId = avo.id;
            modified = true;
          }
          if (danilo && !mae.childrenIds.includes(danilo.id)) {
            mae.childrenIds.push(danilo.id);
            modified = true;
          }
        }

        // 7. Corrige Aparecida (avó): mãe de Maria Lucia
        if (avo) {
          if (mae && !avo.childrenIds.includes(mae.id)) {
            avo.childrenIds.push(mae.id);
            modified = true;
          }
        }

        // 8. Vincula tios Bertonha à avó Aparecida se houver
        this.activeFamily.members.forEach(m => {
          if (avo && mae && m.name && m.name.includes('Bertonha') && m.id !== mae.id && m.id !== avo.id && (m.role === 'Irmão' || m.role === 'Irmã' || m.role === 'Tio' || m.role === 'Tia')) {
            if (m.parentId !== avo.id) {
              m.parentId = avo.id;
              modified = true;
            }
            if (!avo.childrenIds.includes(m.id)) {
              avo.childrenIds.push(m.id);
              modified = true;
            }
          }
        });

        // Limpeza de inconsistências cruzadas geral para todos os membros
        this.activeFamily.members.forEach(m => {
          if (m.childrenIds) {
            const validChildren = m.childrenIds.filter(childId => {
              const child = membersMap.get(childId);
              return child && (child.parentId === m.id || child.parentId2 === m.id);
            });
            if (validChildren.length !== m.childrenIds.length) {
              m.childrenIds = validChildren;
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
          // Higiene de dados local: salva só no dispositivo, sem sincronizar a
          // família inteira na nuvem a cada carregamento (economiza cota do banco).
          StorageManager.saveFamilyLocal(this.activeFamily);
        }
      }

      this.treeRenderer.render(this.activeFamily);
    }
  }

  setupEventListeners() {
    // Avisa o usuário quando a sincronização com a nuvem falha (ex.: cota do banco
    // esgotada), em vez de mostrar um "salvo com sucesso" enganoso. A alteração
    // permanece salva neste dispositivo e será reenviada quando o banco voltar.
    this._lastCloudErrToast = 0;
    window.addEventListener('raizes-cloud-error', () => {
      const now = Date.now();
      if (now - this._lastCloudErrToast < 6000) return;
      this._lastCloudErrToast = now;
      ModalManager.showToast('Alteração salva neste dispositivo, mas a sincronização com a nuvem falhou (possível cota do banco esgotada). Ela será reenviada quando o banco voltar.', 'error');
      const badge = document.getElementById('supabase-status-badge');
      if (badge) {
        badge.textContent = 'Falha de Sincronização';
        badge.style.background = '#b91c1c';
        badge.style.color = '#fecaca';
      }
    });

    // Botões de Login (Firebase Auth real)
    const btnGoogle = document.getElementById('btn-login-google');
    if (btnGoogle) {
      btnGoogle.addEventListener('click', async () => {
        btnGoogle.disabled = true;
        try {
          await AuthManager.loginWithGoogle();
          ModalManager.showToast('Login realizado com sucesso!', 'success');
        } catch (err) {
          ModalManager.showToast(err.message, 'error');
        } finally {
          btnGoogle.disabled = false;
        }
      });
    }

    // Alterna o formulário entre "Entrar" e "Criar conta"
    this.emailFormMode = 'login';
    const linkToggleRegister = document.getElementById('link-toggle-register');
    if (linkToggleRegister) {
      linkToggleRegister.addEventListener('click', (e) => {
        e.preventDefault();
        this.setEmailFormMode(this.emailFormMode === 'login' ? 'register' : 'login');
      });
    }

    const formEmail = document.getElementById('form-login-email');
    if (formEmail) {
      formEmail.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const name = (document.getElementById('login-name') || {}).value || '';
        const submitBtn = formEmail.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
          if (this.emailFormMode === 'register') {
            await AuthManager.registerWithEmail(name.trim(), email, password);
            ModalManager.showToast('Conta criada com sucesso!', 'success');
          } else {
            await AuthManager.loginWithEmail(email, password);
            ModalManager.showToast('Login realizado com sucesso!', 'success');
          }
        } catch (err) {
          ModalManager.showToast(err.message, 'error');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    const btnLogout = document.getElementById('navbar-logout-btn');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        await AuthManager.logout();
        ModalManager.showToast('Você saiu da conta.', 'success');
      });
    }

    // Histórico de atividades (visível só para o dono da família)
    const btnHistory = document.getElementById('navbar-history-btn');
    if (btnHistory) {
      btnHistory.addEventListener('click', () => this.openHistoryModal());
    }

    // Confirmação da escolha de card ("Qual desses é você?")
    const btnChooseCardSkip = document.getElementById('btn-choose-card-skip');
    if (btnChooseCardSkip) {
      btnChooseCardSkip.addEventListener('click', () => ModalManager.closeModal('modal-choose-card'));
    }

    const btnLeaveFamily = document.getElementById('navbar-leave-family-btn');
    if (btnLeaveFamily) {
      btnLeaveFamily.addEventListener('click', () => this.handleLeaveFamily());
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
          const newFam = FamilyManager.createFamily(familyName, this.currentUser.name, this.currentUser.photo, this.currentUser.id);
          this.activeFamily = newFam;
          this.recordAudit('criou a família', { name: familyName });
          ModalManager.closeModal('modal-create-family');
          this.showScreen('dashboard-screen');
          this.renderTree();
          this.refreshHistoryButton();
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

    // Botões para adicionar parentes diretamente a partir do modal de edição
    const btnModalAddChild = document.getElementById('btn-modal-add-child');
    if (btnModalAddChild) {
      btnModalAddChild.addEventListener('click', () => {
        if (this.editingMember) {
          this.openAddRelativeModal(this.editingMember, 'Filho');
        }
      });
    }

    const btnModalAddSpouse = document.getElementById('btn-modal-add-spouse');
    if (btnModalAddSpouse) {
      btnModalAddSpouse.addEventListener('click', () => {
        if (this.editingMember) {
          this.openAddRelativeModal(this.editingMember, 'Cônjuge');
        }
      });
    }

    const btnModalAddParent = document.getElementById('btn-modal-add-parent');
    if (btnModalAddParent) {
      btnModalAddParent.addEventListener('click', () => {
        if (this.editingMember) {
          this.openAddRelativeModal(this.editingMember, 'Pai');
        }
      });
    }

    const btnModalAddSibling = document.getElementById('btn-modal-add-sibling');
    if (btnModalAddSibling) {
      btnModalAddSibling.addEventListener('click', () => {
        if (this.editingMember) {
          this.openAddRelativeModal(this.editingMember, 'Irmão');
        }
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

    const btnToggleOrientation = document.getElementById('btn-toggle-orientation');
    if (btnToggleOrientation) btnToggleOrientation.addEventListener('click', () => this.treeRenderer.toggleOrientation());

    const btnToggleLayout = document.getElementById('btn-toggle-layout');
    if (btnToggleLayout) btnToggleLayout.addEventListener('click', () => this.treeRenderer.toggleAxis());

    const btnToggleDiagonal = document.getElementById('btn-toggle-diagonal');
    if (btnToggleDiagonal) btnToggleDiagonal.addEventListener('click', () => this.treeRenderer.toggleDiagonal());

    const btnToggleRadial = document.getElementById('btn-toggle-radial');
    if (btnToggleRadial) btnToggleRadial.addEventListener('click', () => this.treeRenderer.toggleRadial());

    const btnToggleLineStyle = document.getElementById('btn-toggle-line-style');
    if (btnToggleLineStyle) btnToggleLineStyle.addEventListener('click', () => this.treeRenderer.toggleLineStyle());

    const btnToggleTheme = document.getElementById('btn-toggle-theme');
    if (btnToggleTheme) btnToggleTheme.addEventListener('click', () => this.toggleTheme());

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

    const btnDeleteMember = document.getElementById('btn-delete-member');
    if (btnDeleteMember) {
      btnDeleteMember.addEventListener('click', () => {
        if (!this.editingMember || !this.activeFamily) return;

        ModalManager.confirm(`Tem certeza que deseja excluir <strong>${this.editingMember.name}</strong> da árvore? Esta ação é irreversível e removerá todas as conexões diretas deste membro.`, () => {
          try {
            FamilyManager.deleteMember(this.activeFamily.id, this.editingMember.id);
            ModalManager.showToast('Membro excluído com sucesso!', 'success');
            ModalManager.closeModal('modal-member');
            this.activeFamily = StorageManager.getActiveFamily();
            this.renderTree();
          } catch (err) {
            ModalManager.showToast(err.message, 'error');
          }
        });
      });
    }

    const btnInviteExisting = document.getElementById('btn-invite-existing-member');
    if (btnInviteExisting) {
      btnInviteExisting.addEventListener('click', () => {
        if (!this.editingMember || !this.activeFamily) return;

        ModalManager.confirm(
          `Deseja gerar um link de convite exclusivo para <strong>${this.editingMember.name}</strong>? O perfil passará para o status "Pendente" até que o familiar acesse e crie sua conta.`,
          () => {
            try {
              this.editingMember.memberType = 'invite';
              this.editingMember.status = 'pendente';

              FamilyManager.updateMember(this.activeFamily.id, this.editingMember);

              ModalManager.closeModal('modal-member');
              this.activeFamily = StorageManager.getActiveFamily();
              this.renderTree();

              setTimeout(() => {
                this.resendInvite(this.editingMember);
              }, 500);
            } catch (err) {
              ModalManager.showToast(err.message, 'error');
            }
          },
          {
            title: 'Convidar Familiar para Perfil',
            confirmText: 'Gerar Convite',
            confirmBtnClass: 'btn-primary',
            confirmBtnStyle: 'background: var(--accent-blue); border-color: var(--accent-blue); color: #ffffff; min-width: 120px;'
          }
        );
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
          this.recordAudit('entrou e vinculou-se ao card', { id: memberId });
          ModalManager.showToast(`Conta vinculada com sucesso na ${this.activeFamily.name}!`, 'success');
        } else {
          this.activeFamily = FamilyManager.joinFamilyDirectly(conflictResult.targetFamily.id);
          this.recordAudit('entrou na família', { name: this.activeFamily.name });
          ModalManager.showToast(`Bem-vindo à ${this.activeFamily.name}!`, 'success');
        }
        this.showScreen('dashboard-screen');
        this.renderTree();
        this.refreshHistoryButton();
        if (!memberId) this.maybePromptChooseCard();
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

  openAddRelativeModal(member, defaultRelation = null) {
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

    const relationsSection = document.getElementById('edit-member-add-relations-section');
    if (relationsSection) relationsSection.style.display = 'none';

    const coupleSection = document.getElementById('edit-member-couple-link-section');
    if (coupleSection) coupleSection.style.display = 'none';

    const relSelect = document.getElementById('member-relationship');
    relSelect.innerHTML = `
      <option value="Filho">Filho / Filha</option>
      <option value="Cônjuge">Cônjuge / Parceiro(a)</option>
      <option value="Pai">Pai / Mãe</option>
      <option value="Irmão">Irmão / Irmã</option>
    `;
    if (defaultRelation) {
      relSelect.value = defaultRelation;
    }

    const btnDeleteMember = document.getElementById('btn-delete-member');
    console.log('[DEBUG] openAddRelativeModal -> btnDeleteMember:', btnDeleteMember);
    if (btnDeleteMember) btnDeleteMember.style.display = 'none';

    const btnInviteExisting = document.getElementById('btn-invite-existing-member');
    if (btnInviteExisting) btnInviteExisting.style.display = 'none';

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

    const relationsSection = document.getElementById('edit-member-add-relations-section');
    if (relationsSection) relationsSection.style.display = 'block';

    // Controle de ligação ao casal (segundo pai/mãe). Só faz sentido quando o pai/mãe
    // deste membro tem cônjuge — aí o filho pode ser do casal ou de outro relacionamento.
    const coupleSection = document.getElementById('edit-member-couple-link-section');
    const bothParentsCb = document.getElementById('member-both-parents');
    const coParentNameEl = document.getElementById('member-co-parent-name');
    if (coupleSection && bothParentsCb) {
      const parent = member.parentId ? this.activeFamily.members.find(m => m.id === member.parentId) : null;
      const coParent = parent && parent.partnerId ? this.activeFamily.members.find(m => m.id === parent.partnerId) : null;
      if (parent && coParent) {
        coupleSection.style.display = 'block';
        bothParentsCb.checked = !!member.parentId2;
        bothParentsCb.dataset.coParentId = coParent.id;
        if (coParentNameEl) coParentNameEl.textContent = `${parent.name} e ${coParent.name}`;
      } else {
        coupleSection.style.display = 'none';
        bothParentsCb.checked = false;
        delete bothParentsCb.dataset.coParentId;
      }
    }

    const statusSelect = document.getElementById('member-status');
    const deathGroup = document.getElementById('group-member-death');
    if (statusSelect && deathGroup) {
      statusSelect.value = member.status || 'vivo';
      deathGroup.style.display = member.status === 'falecido' ? 'block' : 'none';
    }

    const relSelect = document.getElementById('member-relationship');
    relSelect.innerHTML = `<option value="${member.role}">${member.role}</option>`;

    const btnDeleteMember = document.getElementById('btn-delete-member');
    console.log('[DEBUG] openEditMemberModal -> btnDeleteMember:', btnDeleteMember);
    console.log('[DEBUG] editingMember:', member);
    console.log('[DEBUG] activeFamily.rootMemberId:', this.activeFamily?.rootMemberId);
    if (btnDeleteMember) {
      if (this.activeFamily && this.activeFamily.rootMemberId === member.id) {
        btnDeleteMember.style.display = 'none';
        console.log('[DEBUG] Ocultando botão - é o root');
      } else {
        btnDeleteMember.style.display = 'inline-flex';
        console.log('[DEBUG] Mostrando botão - não é o root');
      }
    }

    const btnInviteExisting = document.getElementById('btn-invite-existing-member');
    if (btnInviteExisting) {
      if (member.status !== 'falecido' && !member.linkedUserId) {
        btnInviteExisting.style.display = 'inline-flex';
      } else {
        btnInviteExisting.style.display = 'none';
      }
    }

    ModalManager.openModal('modal-member');
  }

  // Converte uma foto que ainda é uma URL externa (Google Photos, OneDrive, link
  // direto, etc.) em um Data URL base64 autocontido. Assim a imagem fica PERMANENTE
  // no banco e não some quando o link externo expira ou passa a bloquear hotlink —
  // causa comum de "as fotos não atualizam". Faz downscale para 300x300 webp (igual
  // ao recorte) para manter o documento pequeno. Em caso de falha retorna null e o
  // chamador mantém a URL original (comportamento anterior, sem regressão).
  async resolvePhotoToDataUrl(src) {
    if (!src || !/^https?:\/\//i.test(src)) return null; // já é data:/silhueta/vazio
    const candidates = [
      src, // tentativa direta (muitas URLs já permitem CORS de leitura)
      `https://corsproxy.io/?${encodeURIComponent(src)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(src)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(src)}`
    ];
    for (const url of candidates) {
      try {
        // Timeout por tentativa: proxies CORS podem ficar lentos/fora do ar; não
        // deixamos o salvamento travar — abortamos e tentamos o próximo.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        let resp;
        try {
          resp = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!resp.ok) continue;
        const blob = await resp.blob();
        if (!blob.type.startsWith('image/')) continue;
        const dataUrl = await this._blobToSquareDataUrl(blob);
        if (dataUrl) return dataUrl;
      } catch (e) { /* tenta o próximo proxy */ }
    }
    return null;
  }

  // Recebe um Blob de imagem (same-origin via proxy) e devolve um Data URL webp
  // quadrado 300x300 (object-fit: cover). Retorna null se não conseguir processar.
  _blobToSquareDataUrl(blob) {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const size = 300;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const scale = Math.max(size / img.width, size / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          resolve(canvas.toDataURL('image/webp', 0.85));
        } catch (e) {
          resolve(null);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
      img.src = objectUrl;
    });
  }

  async saveMember() {
    if (!this.activeFamily) return;

    const name = document.getElementById('member-name').value.trim();
    const birthDate = document.getElementById('member-birth').value;
    const deathDate = document.getElementById('member-death').value;
    const status = document.getElementById('member-status').value;
    const bio = document.getElementById('member-bio').value.trim();
    let photo = document.getElementById('member-photo-preview').src;
    const relationship = document.getElementById('member-relationship').value;

    const memberTypeEl = document.querySelector('input[name="member-type"]:checked');
    const memberType = memberTypeEl ? memberTypeEl.value : 'offline';

    if (!name) {
      ModalManager.showToast('O nome é obrigatório.', 'error');
      return;
    }

    // Torna a foto permanente: se ainda for uma URL externa, baixa e converte para
    // base64 antes de salvar, para que não dependa de um link que pode expirar.
    if (/^https?:\/\//i.test(photo)) {
      ModalManager.showToast('Salvando a foto de forma permanente...', 'success');
      const dataUrl = await this.resolvePhotoToDataUrl(photo);
      if (dataUrl) {
        photo = dataUrl;
      } else {
        ModalManager.showToast('Não foi possível baixar a imagem do link; ele será salvo como referência.', 'error');
      }
    }

    try {
      if (this.editingMember) {
        const updateData = {
          id: this.editingMember.id,
          name, birthDate, deathDate, status, bio, photo
        };
        // Associação/desassociação do filho ao casal (segundo pai/mãe)
        const coupleSection = document.getElementById('edit-member-couple-link-section');
        const bothParentsCb = document.getElementById('member-both-parents');
        if (coupleSection && coupleSection.style.display !== 'none' && bothParentsCb) {
          updateData.parentId2 = bothParentsCb.checked ? (bothParentsCb.dataset.coParentId || null) : null;
        }
        FamilyManager.updateMember(this.activeFamily.id, updateData);
        this.recordAudit('editou', { id: this.editingMember.id, name });
        ModalManager.showToast('Membro atualizado com sucesso!', 'success');
      } else if (this.selectedMemberForAdd) {
        let parentId = null;
        let parentId2 = null;
        let partnerId = null;
        let childIdToLink = null;
        let role = relationship;

        if (relationship === 'Filho') {
          parentId = this.selectedMemberForAdd.id;
          // Padrão: filho biológico do casal — liga aos dois pais quando há cônjuge.
          // Pode ser desassociado depois na edição (filhos de outros relacionamentos).
          parentId2 = this.selectedMemberForAdd.partnerId || null;
        } else if (relationship === 'Cônjuge') {
          partnerId = this.selectedMemberForAdd.id;
        } else if (relationship === 'Pai') {
          role = 'Pai/Mãe';
          childIdToLink = this.selectedMemberForAdd.id;
        } else if (relationship === 'Irmão') {
          // Irmão compartilha os mesmos pais (incluindo o casal, se houver)
          parentId = this.selectedMemberForAdd.parentId;
          parentId2 = this.selectedMemberForAdd.parentId2 || null;
        }

        const newMem = FamilyManager.addMember(this.activeFamily.id, {
          name, birthDate, deathDate, status: memberType === 'invite' ? 'pendente' : status, bio, photo, role, parentId, parentId2, partnerId, childIdToLink, memberType
        });

        if (memberType === 'invite') {
          this.recordAudit('criou um convite para', { id: newMem.id, name });
          ModalManager.showToast('Convite pendente criado! Compartilhe o link abaixo com o familiar.', 'success');
          setTimeout(() => {
            this.resendInvite(newMem);
          }, 500);
        } else {
          this.recordAudit('adicionou', { id: newMem.id, name, details: relationship });
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

  async openCropperModal(imageSrc) {
    const imageToCrop = document.getElementById('image-to-crop');
    imageToCrop.crossOrigin = 'anonymous'; // Atributo padrão de segurança CORS

    // Se for uma URL externa (http/https) e não for um Data URL base64
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      ModalManager.showToast('Carregando imagem para edição segura...', 'success');
      
      // Lista de proxies CORS robustos para tentar obter o Data URL limpo
      const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(imageSrc)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(imageSrc)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(imageSrc)}`
      ];

      let success = false;
      for (const proxyUrl of proxies) {
        try {
          const response = await fetch(proxyUrl);
          if (response.ok) {
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
              imageToCrop.src = reader.result; // Data URL seguro (same-origin)
              this.initCropperInstance(imageToCrop);
            };
            reader.readAsDataURL(blob);
            ModalManager.openModal('modal-crop');
            success = true;
            break;
          }
        } catch (err) {
          console.warn(`Falha no proxy CORS ${proxyUrl}, tentando próximo...`, err);
        }
      }

      if (!success) {
        console.warn('Todos os proxies falharam. Tentando carregamento direto com crossOrigin...');
        imageToCrop.src = imageSrc;
        ModalManager.openModal('modal-crop');
        this.initCropperInstance(imageToCrop);
      }
    } else {
      imageToCrop.src = imageSrc;
      ModalManager.openModal('modal-crop');
      this.initCropperInstance(imageToCrop);
    }
  }

  initCropperInstance(imageToCrop) {
    if (this.cropperInstance) {
      this.cropperInstance.destroy();
    }

    // Inicializa o Cropper após a imagem carregar no modal
    setTimeout(() => {
      if (window.Cropper) {
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
      }
    }, 200);
  }
}

// Inicializa a aplicação
new App();
