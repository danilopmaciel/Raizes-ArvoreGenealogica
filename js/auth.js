// Módulo de Autenticação REAL (Firebase Auth: Google + E-mail/Senha)

import StorageManager from './storage.js?v=20260607_02';
import firebaseAdapterInstance from './firebase.js?v=20260607_02';

const DEFAULT_SILHOUETTE = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22%2394a3b8%22%3E%3Cpath%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E';

// Converte o usuário do Firebase no formato interno do app
function mapUser(fbUser) {
  if (!fbUser) return null;
  return {
    id: fbUser.uid,
    name: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Usuário'),
    email: fbUser.email || '',
    photo: fbUser.photoURL || DEFAULT_SILHOUETTE,
    provider: (fbUser.providerData && fbUser.providerData[0] && fbUser.providerData[0].providerId) || 'firebase'
  };
}

// Traduz os códigos de erro do Firebase Auth para mensagens claras em PT
function friendlyAuthError(err) {
  const code = err && err.code;
  const map = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-not-found': 'Conta não encontrada. Crie uma conta primeiro.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Este e-mail já está cadastrado. Faça login.',
    'auth/weak-password': 'A senha deve ter ao menos 6 caracteres.',
    'auth/popup-closed-by-user': 'Login cancelado.',
    'auth/cancelled-popup-request': 'Login cancelado.',
    'auth/popup-blocked': 'O navegador bloqueou o popup. Permita popups e tente novamente.',
    'auth/operation-not-allowed': 'Este método de login não está habilitado no Firebase Console.',
    'auth/configuration-not-found': 'A Autenticação não está ativada no Firebase Console. Habilite Google e E-mail/senha em Authentication → Sign-in method.',
    'auth/unauthorized-domain': 'Este domínio não está autorizado no Firebase Authentication.',
    'auth/network-request-failed': 'Falha de rede. Verifique sua conexão.'
  };
  return new Error(map[code] || (err && err.message) || 'Erro de autenticação.');
}

class AuthManager {
  // Assina o estado de autenticação real. Deve ser chamado DEPOIS de o Firebase
  // ter sido configurado em app.js (senão não há auth para assinar).
  static init(onAuthStateChanged) {
    this.onAuthStateChanged = onAuthStateChanged;

    if (firebaseAdapterInstance.hasAuth && firebaseAdapterInstance.hasAuth()) {
      firebaseAdapterInstance.onAuthChange((fbUser) => {
        const user = mapUser(fbUser);
        StorageManager.setCurrentUser(user); // cache para UI offline
        if (this.onAuthStateChanged) this.onAuthStateChanged(user);
      });
    } else {
      // Sem Authentication disponível: segue deslogado (sem usuário simulado).
      StorageManager.setCurrentUser(null);
      if (this.onAuthStateChanged) this.onAuthStateChanged(null);
    }
  }

  static async loginWithGoogle() {
    try {
      const fbUser = await firebaseAdapterInstance.signInGoogle();
      return mapUser(fbUser);
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }

  static async loginWithEmail(email, password) {
    if (!email || !password) throw new Error('Por favor, preencha e-mail e senha.');
    try {
      const fbUser = await firebaseAdapterInstance.signInEmail(email, password);
      return mapUser(fbUser);
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }

  static async registerWithEmail(name, email, password) {
    if (!email || !password) throw new Error('Por favor, preencha e-mail e senha.');
    if (password.length < 6) throw new Error('A senha deve ter ao menos 6 caracteres.');
    try {
      const fbUser = await firebaseAdapterInstance.registerEmail(name, email, password);
      return mapUser(fbUser);
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }

  static async logout() {
    await firebaseAdapterInstance.signOutUser();
    StorageManager.setCurrentUser(null);
    StorageManager.setActiveFamily(null);
    // Se não há Auth real, o onAuthChange não dispara — força a atualização da tela.
    if (!(firebaseAdapterInstance.hasAuth && firebaseAdapterInstance.hasAuth()) && this.onAuthStateChanged) {
      this.onAuthStateChanged(null);
    }
  }

  static getCurrentUser() {
    return StorageManager.getCurrentUser();
  }
}

export default AuthManager;
