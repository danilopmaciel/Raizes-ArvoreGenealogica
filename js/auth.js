// Módulo de Autenticação (Google, E-mail e Sessão)

import StorageManager from './storage.js?v=20260601_05';

const DEFAULT_SILHOUETTE = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22%2394a3b8%22%3E%3Cpath%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E';

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
