// Módulo de Autenticação (Google, E-mail e Sessão)

import StorageManager from './storage.js';

const DEFAULT_SILHOUETTE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

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
        photo: DEFAULT_SILHOUETTE,
        provider: 'google'
      },
      {
        id: 'usr_google_2',
        name: 'Helena Silva',
        email: 'helena.silva@gmail.com',
        photo: DEFAULT_SILHOUETTE,
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
      photo: DEFAULT_SILHOUETTE,
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
