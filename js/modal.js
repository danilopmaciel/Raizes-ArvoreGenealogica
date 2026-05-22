// Módulo de Gerenciamento de Modais e Notificações (Toast)

class ModalManager {
  static init() {
    // Configura eventos para fechar modais ao clicar no botão de fechar ou no backdrop
    document.addEventListener('click', (e) => {
      if (e.target.closest('.btn-close-modal')) {
        const modal = e.target.closest('.modal-backdrop');
        if (modal) this.closeModal(modal.id);
      }
      
      if (e.target.classList.contains('modal-backdrop')) {
        this.closeModal(e.target.id);
      }
    });

    // Evento para fechar com tecla ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });
  }

  static openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden'; // Evita scroll de fundo
    }
  }

  static closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  static closeAllModals() {
    const activeModals = document.querySelectorAll('.modal-backdrop.active');
    activeModals.forEach(modal => {
      modal.classList.remove('active');
    });
    document.body.style.overflow = '';
  }

  static confirm(message, onConfirm, options = {}) {
    const oldModal = document.getElementById('modal-custom-confirm');
    if (oldModal) oldModal.remove();

    const title = options.title || 'Excluir Membro';
    const confirmText = options.confirmText || 'Excluir';
    const confirmBtnClass = options.confirmBtnClass || 'btn-danger';
    const confirmBtnStyle = options.confirmBtnStyle || 'background: #ef4444; border-color: #dc2626; color: #ffffff; min-width: 100px;';

    const backdrop = document.createElement('div');
    backdrop.id = 'modal-custom-confirm';
    backdrop.className = 'modal-backdrop active';
    backdrop.style.zIndex = '9999';

    backdrop.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px; border: 1px solid rgba(139, 92, 246, 0.4); background: #0f172a; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
        <div class="modal-header" style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding: 15px 20px;">
          <h3 class="modal-title" style="color: #f8fafc; font-size: 1.25rem;">${title}</h3>
          <button type="button" class="btn-close-modal" id="btn-close-confirm" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.5rem; transition: color 0.2s;">&times;</button>
        </div>
        <div class="modal-body" style="padding: 25px 20px; font-size: 1rem; color: #cbd5e1; text-align: center;">
          ${message}
        </div>
        <div class="modal-footer" style="display: flex; gap: 12px; justify-content: center; padding: 15px 20px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
          <button type="button" class="btn btn-secondary" id="btn-cancel-confirm" style="min-width: 100px;">Cancelar</button>
          <button type="button" class="btn ${confirmBtnClass}" id="btn-confirm-delete-action" style="${confirmBtnStyle}">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    const closeConfirm = () => {
      backdrop.remove();
      document.body.style.overflow = '';
    };

    backdrop.querySelector('#btn-close-confirm').addEventListener('click', closeConfirm);
    backdrop.querySelector('#btn-cancel-confirm').addEventListener('click', closeConfirm);
    
    // Hover effects para o fechar
    const closeBtn = backdrop.querySelector('#btn-close-confirm');
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#f8fafc');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#94a3b8');

    backdrop.querySelector('#btn-confirm-delete-action').addEventListener('click', () => {
      closeConfirm();
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeConfirm();
      }
    });
  }

  static showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Ícone dependendo do tipo
    const icon = type === 'success' ? '✓' : '✕';
    toast.innerHTML = `<span style="font-weight: bold; font-size: 1.1rem;">${icon}</span> <span>${message}</span>`;
    
    container.appendChild(toast);

    // Remove após a animação (3.3s total)
    setTimeout(() => {
      toast.remove();
      if (container.children.length === 0) {
        container.remove();
      }
    }, 3300);
  }
}

export default ModalManager;
