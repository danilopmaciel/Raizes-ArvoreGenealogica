// Módulo de Autenticação (Google, E-mail e Sessão)

import StorageManager from './storage.js';

class AuthManager {
  static init(onAuthStateChanged) {
    this.onAuthStateChanged = onAuthStateChanged;
    const currentUser = StorageManager.getCurrentUser();
    if (this.onAuthStateChanged) {
      this.onAuthStateChanged(currentUser);
    }
  }

  static loginWithGoogle() {
    // Simulação visual perfeita de Login com o Google
    const mockGoogleUsers = [
      {
        id: 'usr_google_1',
        name: 'Danilo Maciel',
        email: 'danilopmaciel@gmail.com',
        photo: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        provider: 'google'
      },
      {
        id: 'usr_google_2',
        name: 'Helena Silva',
        email: 'helena.silva@gmail.com',
        photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        provider: 'google'
      }
    ];

    // Para um efeito UAU imediato e fluido, logamos com o usuário principal
    const selectedUser = mockGoogleUsers[0];
    StorageManager.setCurrentUser(selectedUser);
    
    if (this.onAuthStateChanged) {
      this.onAuthStateChanged(selectedUser);
    }
    return selectedUser;
  }

  static loginWithEmail(email, password) {
    if (!email || !password) {
      throw new Error('Por favor, preencha e-mail e senha.');
    }

    // Cria um usuário baseado no e-mail fornecido
    const namePart = email.split('@')[0];
    const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    
    const newUser = {
      id: 'usr_email_' + Date.now(),
      name: formattedName,
      email: email,
      photo: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
      provider: 'email'
    };

    StorageManager.setCurrentUser(newUser);
    
    if (this.onAuthStateChanged) {
      this.onAuthStateChanged(newUser);
    }
    return newUser;
  }

  static logout() {
    StorageManager.setCurrentUser(null);
    StorageManager.setActiveFamily(null);
    if (this.onAuthStateChanged) {
      this.onAuthStateChanged(null);
    }
  }

  static getCurrentUser() {
    return StorageManager.getCurrentUser();
  }
}

export default AuthManager;
