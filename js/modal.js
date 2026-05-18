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
