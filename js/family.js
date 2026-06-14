// Módulo de Gestão de Famílias, Convites e Algoritmos de Mesclagem/Aninhamento

import StorageManager from './storage.js?v=20260614_02';

const DEFAULT_SILHOUETTE = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22%2394a3b8%22%3E%3Cpath%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E';

class FamilyManager {
  static createFamily(name, userName, userPhoto, ownerUserId = null) {
    if (!name) throw new Error('O nome da família é obrigatório.');
    return StorageManager.createFamily(name, userName, userPhoto, ownerUserId);
  }

  static getInviteLink(familyCode, memberId = null) {
    const baseUrl = window.location.origin + window.location.pathname;
    let link = `${baseUrl}?invite=${familyCode}`;
    if (memberId) {
      link += `&memberId=${memberId}`;
    }
    return link;
  }

  static shareViaWhatsApp(familyCode, familyName, memberId = null, memberName = null) {
    const link = this.getInviteLink(familyCode, memberId);
    let text = `Olá! Venha fazer parte da árvore genealógica da ${familyName} na plataforma Raízes! Acesse o link ou use o código ${familyCode}: ${link}`;
    if (memberId && memberName) {
      text = `Olá, ${memberName}! Criei o seu cartão na nossa árvore genealógica da ${familyName}. Clique no link exclusivo para acessar, criar sua conta e assumir seu perfil na árvore: ${link}`;
    }
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  static shareViaEmail(familyCode, familyName, memberId = null, memberName = null) {
    const link = this.getInviteLink(familyCode, memberId);
    let subject = `Convite para a Árvore Genealógica da ${familyName}`;
    let body = `Olá!\n\nVocê foi convidado para ingressar na árvore genealógica da ${familyName} na plataforma Raízes.\n\nPara participar, clique no link abaixo ou insira o código de convite: ${familyCode}\n\nLink: ${link}\n\nEstamos construindo nossa história juntos!`;
    if (memberId && memberName) {
      subject = `Convite Exclusivo para ${memberName} — Árvore Genealógica da ${familyName}`;
      body = `Olá, ${memberName}!\n\nCriei o seu cartão na nossa árvore genealógica da ${familyName} na plataforma Raízes.\n\nPara acessar, criar sua conta e assumir o gerenciamento do seu perfil na árvore, clique no link exclusivo abaixo:\n\nLink: ${link}\n\nEstamos construindo nossa história juntos!`;
    }
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
      photo: memberData.photo || DEFAULT_SILHOUETTE,
      role: memberData.role || 'Parente',
      parentId: memberData.parentId || null,
      parentId2: memberData.parentId2 || null,
      partnerId: memberData.partnerId || null,
      childrenIds: [],
      bio: memberData.bio || '',
      memberType: memberData.memberType || 'offline',
      status: memberData.status || 'vivo',
      deathDate: memberData.deathDate || null
    };

    // Atualiza referências nos parentes associados
    if (newMember.parentId) {
      const parent = family.members.find(m => m.id === newMember.parentId);
      if (parent) {
        if (!parent.childrenIds) parent.childrenIds = parent.children || [];
        if (!parent.childrenIds.includes(newMemberId)) {
          parent.childrenIds.push(newMemberId);
        }
      }
    }

    // Segundo pai/mãe (filho biológico do casal): registra o vínculo também no co-pai
    if (newMember.parentId2) {
      const coParent = family.members.find(m => m.id === newMember.parentId2);
      if (coParent) {
        if (!coParent.childrenIds) coParent.childrenIds = coParent.children || [];
        if (!coParent.childrenIds.includes(newMemberId)) {
          coParent.childrenIds.push(newMemberId);
        }
      }
    }

    if (newMember.partnerId) {
      const partner = family.members.find(m => m.id === newMember.partnerId);
      if (partner) {
        partner.partnerId = newMemberId; // Relacionamento bidirecional
      }
    }

    if (memberData.childIdToLink) {
      const child = family.members.find(m => m.id === memberData.childIdToLink);
      if (child) {
        child.parentId = newMemberId;
        newMember.childrenIds.push(child.id);
      }
    }

    family.members.push(newMember);

    // Sincroniza só os membros tocados (o novo e os parentes cujas referências mudaram)
    const changed = [newMemberId];
    if (newMember.parentId) changed.push(newMember.parentId);
    if (newMember.parentId2) changed.push(newMember.parentId2);
    if (newMember.partnerId) changed.push(newMember.partnerId);
    if (memberData.childIdToLink) changed.push(memberData.childIdToLink);

    StorageManager.saveFamily(family, { changedMemberIds: changed });
    return newMember;
  }

  static updateMember(familyId, memberData) {
    const families = StorageManager.getFamilies();
    const family = families.find(f => f.id === familyId);
    if (!family) throw new Error('Família não encontrada.');

    const index = family.members.findIndex(m => m.id === memberData.id);
    if (index !== -1) {
      const existing = family.members[index];
      const touched = [memberData.id];

      // Tratamento da (des)associação do segundo pai/mãe (filho do casal):
      // mantém o childrenIds dos co-pais coerente quando o vínculo muda.
      if (Object.prototype.hasOwnProperty.call(memberData, 'parentId2')) {
        const oldCo = existing.parentId2 || null;
        const newCo = memberData.parentId2 || null;
        if (oldCo && oldCo !== newCo) {
          const oldParent = family.members.find(m => m.id === oldCo);
          if (oldParent && Array.isArray(oldParent.childrenIds)) {
            oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== existing.id);
            touched.push(oldParent.id);
          }
        }
        if (newCo) {
          const newParent = family.members.find(m => m.id === newCo);
          if (newParent) {
            if (!newParent.childrenIds) newParent.childrenIds = [];
            if (!newParent.childrenIds.includes(existing.id)) {
              newParent.childrenIds.push(existing.id);
            }
            touched.push(newParent.id);
          }
        }
      }

      family.members[index] = { ...existing, ...memberData };
      StorageManager.saveFamily(family, { changedMemberIds: touched });
    }
  }

  static deleteMember(familyId, memberId) {
    const families = StorageManager.getFamilies();
    const family = families.find(f => f.id === familyId);
    if (!family) throw new Error('Família não encontrada.');

    if (family.rootMemberId === memberId) {
      throw new Error('Não é possível excluir o membro raiz/fundador da família.');
    }

    // Limpeza e auto-linking nos outros membros (registrando quais foram tocados)
    const touched = [];
    family.members.forEach(m => {
      let changed = false;
      if (m.parentId === memberId) { m.parentId = null; changed = true; }
      if (m.parentId2 === memberId) { m.parentId2 = null; changed = true; }
      if (m.partnerId === memberId) { m.partnerId = null; changed = true; }
      if (m.childrenIds && m.childrenIds.includes(memberId)) {
        m.childrenIds = m.childrenIds.filter(id => id !== memberId);
        changed = true;
      }
      if (changed) touched.push(m.id);
    });

    family.members = family.members.filter(m => m.id !== memberId);
    StorageManager.saveFamily(family, { changedMemberIds: touched, deletedMemberIds: [memberId] });
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

  static linkUserToMember(familyId, memberId, currentUser) {
    const families = StorageManager.getFamilies();
    const family = families.find(f => f.id === familyId);
    if (!family) throw new Error('Família não encontrada.');

    const member = family.members.find(m => m.id === memberId);
    if (!member) throw new Error('Cartão de membro pendente não encontrado.');

    // Atualiza o cartão de membro com os dados reais do usuário logado
    member.name = currentUser.name;
    member.photo = currentUser.photo || member.photo;
    member.status = 'vivo';
    member.memberType = 'online';
    member.linkedUserId = currentUser.id;

    StorageManager.saveFamily(family, { changedMemberIds: [memberId] });
    StorageManager.setActiveFamily(family.id);
    return family;
  }

  // Vincula a conta logada a um card EXISTENTE escolhido pela pessoa.
  // Diferente de linkUserToMember: NÃO altera nome nem foto do card (apenas vincula).
  static chooseCard(familyId, memberId, user) {
    const families = StorageManager.getFamilies();
    const family = families.find(f => f.id === familyId);
    if (!family) throw new Error('Família não encontrada.');

    const member = family.members.find(m => m.id === memberId);
    if (!member) throw new Error('Card não encontrado.');
    if (member.linkedUserId && member.linkedUserId !== user.id) {
      throw new Error('Este card já está vinculado a outra conta.');
    }

    member.linkedUserId = user.id;
    member.memberType = 'online';
    if (!member.status) member.status = 'vivo';

    const touched = [memberId];

    // Se a pessoa escolheu o card raiz e a família ainda não tem dono, ela vira o dono.
    if (family.rootMemberId === memberId && !family.ownerUserId) {
      family.ownerUserId = user.id;
    }

    StorageManager.saveFamily(family, { changedMemberIds: touched });
    return family;
  }

  // Define o dono da família quando ainda não há um (resolve famílias antigas).
  static claimOwnership(familyId, userId) {
    const families = StorageManager.getFamilies();
    const family = families.find(f => f.id === familyId);
    if (!family || family.ownerUserId) return null;
    family.ownerUserId = userId;
    StorageManager.saveFamily(family, { changedMemberIds: [] });
    return family;
  }
}

export default FamilyManager;
