// Módulo de Gestão de Famílias, Convites e Algoritmos de Mesclagem/Aninhamento

import StorageManager from './storage.js';

class FamilyManager {
  static createFamily(name, userName, userPhoto) {
    if (!name) throw new Error('O nome da família é obrigatório.');
    return StorageManager.createFamily(name, userName, userPhoto);
  }

  static getInviteLink(familyCode) {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?invite=${familyCode}`;
  }

  static shareViaWhatsApp(familyCode, familyName) {
    const link = this.getInviteLink(familyCode);
    const text = `Olá! Venha fazer parte da árvore genealógica da ${familyName} na plataforma Raízes! Acesse o link ou use o código ${familyCode}: ${link}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  static shareViaEmail(familyCode, familyName) {
    const link = this.getInviteLink(familyCode);
    const subject = `Convite para a Árvore Genealógica da ${familyName}`;
    const body = `Olá!\n\nVocê foi convidado para ingressar na árvore genealógica da ${familyName} na plataforma Raízes.\n\nPara participar, clique no link abaixo ou insira o código de convite: ${familyCode}\n\nLink: ${link}\n\nEstamos construindo nossa história juntos!`;
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  }

  static addMember(familyId, memberData) {
    const families = StorageManager.getFamilies();
    const family = families.find(f => f.id === familyId);
    if (!family) throw new Error('Família não encontrada.');

    const newMemberId = 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    const newMember = {
      id: newMemberId,
      name: memberData.name,
      birthDate: memberData.birthDate || '',
      photo: memberData.photo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      role: memberData.role || 'Parente',
      parentId: memberData.parentId || null,
      partnerId: memberData.partnerId || null,
      childrenIds: [],
      bio: memberData.bio || ''
    };

    // Atualiza referências nos parentes associados
    if (newMember.parentId) {
      const parent = family.members.find(m => m.id === newMember.parentId);
      if (parent && !parent.childrenIds.includes(newMemberId)) {
        parent.childrenIds.push(newMemberId);
      }
    }

    if (newMember.partnerId) {
      const partner = family.members.find(m => m.id === newMember.partnerId);
      if (partner) {
        partner.partnerId = newMemberId; // Relacionamento bidirecional
      }
    }

    family.members.push(newMember);
    StorageManager.saveFamily(family);
    return newMember;
  }

  static updateMember(familyId, memberData) {
    const families = StorageManager.getFamilies();
    const family = families.find(f => f.id === familyId);
    if (!family) throw new Error('Família não encontrada.');

    const index = family.members.findIndex(m => m.id === memberData.id);
    if (index !== -1) {
      family.members[index] = { ...family.members[index], ...memberData };
      StorageManager.saveFamily(family);
    }
  }

  static checkJoinConflict(inviteCode, currentFamily) {
    const targetFamily = StorageManager.findFamilyByCode(inviteCode);
    if (!targetFamily) {
      throw new Error('Código de convite inválido ou família não encontrada.');
    }

    if (currentFamily && currentFamily.id === targetFamily.id) {
      throw new Error('Você já faz parte desta família!');
    }

    // Se o usuário já tem uma família ativa, temos um conflito que exige decisão
    if (currentFamily && currentFamily.members.length > 0) {
      return {
        hasConflict: true,
        targetFamily,
        currentFamily
      };
    }

    // Sem conflito (usuário sem família ativa), entra direto
    return {
      hasConflict: false,
      targetFamily
    };
  }

  static joinFamilyDirectly(familyId) {
    StorageManager.setActiveFamily(familyId);
    return StorageManager.getActiveFamily();
  }

  // Algoritmo 1: Mesclar Famílias (Merge / Comparação)
  static mergeFamilies(targetFamilyId, sourceFamilyId) {
    const families = StorageManager.getFamilies();
    const targetFamily = families.find(f => f.id === targetFamilyId);
    const sourceFamily = families.find(f => f.id === sourceFamilyId);

    if (!targetFamily || !sourceFamily) {
      throw new Error('Erro ao localizar famílias para mesclagem.');
    }

    // Compara e combina membros para evitar duplicatas exatas
    sourceFamily.members.forEach(sourceMember => {
      // Verifica se já existe alguém com o mesmo nome e data de nascimento na família destino
      const isDuplicate = targetFamily.members.some(
        targetMember => targetMember.name.toLowerCase() === sourceMember.name.toLowerCase() &&
                        targetMember.birthDate === sourceMember.birthDate
      );

      if (!isDuplicate) {
        // Se não for duplicata, adiciona à família destino
        // (Garante IDs únicos ou preserva os originais se não colidirem)
        const existsId = targetFamily.members.some(m => m.id === sourceMember.id);
        const memberToAdd = existsId ? { ...sourceMember, id: sourceMember.id + '_merged' } : sourceMember;
        targetFamily.members.push(memberToAdd);
      }
    });

    // Combina também as subfamílias se houver
    if (sourceFamily.subFamilies) {
      targetFamily.subFamilies = [...(targetFamily.subFamilies || []), ...sourceFamily.subFamilies];
    }

    // Salva a família destino atualizada
    StorageManager.saveFamily(targetFamily);
    
    // Remove a família de origem, pois foi fundida
    const remainingFamilies = families.filter(f => f.id !== sourceFamilyId);
    StorageManager.saveFamilies(remainingFamilies);

    // Define a família destino como ativa
    StorageManager.setActiveFamily(targetFamilyId);
    return targetFamily;
  }

  // Algoritmo 2: Criar como Subfamília / Ramo Aninhado (Nest / Branch)
  static nestFamily(targetFamilyId, sourceFamilyId, hostMemberId) {
    const families = StorageManager.getFamilies();
    const targetFamily = families.find(f => f.id === targetFamilyId);
    const sourceFamily = families.find(f => f.id === sourceFamilyId);

    if (!targetFamily || !sourceFamily) {
      throw new Error('Erro ao localizar famílias para aninhamento.');
    }

    // Adiciona a família de origem como um ramo/subfamília conectado ao hostMemberId
    const subFamilyBranch = {
      ...sourceFamily,
      connectedToHostMemberId: hostMemberId,
      nestedAt: new Date().toISOString()
    };

    if (!targetFamily.subFamilies) {
      targetFamily.subFamilies = [];
    }

    targetFamily.subFamilies.push(subFamilyBranch);
    StorageManager.saveFamily(targetFamily);

    // Remove a família de origem da raiz principal, pois agora vive dentro da família anfitriã
    const remainingFamilies = families.filter(f => f.id !== sourceFamilyId);
    StorageManager.saveFamilies(remainingFamilies);

    StorageManager.setActiveFamily(targetFamilyId);
    return targetFamily;
  }
}

export default FamilyManager;
