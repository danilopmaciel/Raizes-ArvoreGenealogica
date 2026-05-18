# Raízes — Árvore Genealógica Premium ✦

> Uma plataforma web moderna, interativa e elegante para construção, gestão e compartilhamento de árvores genealógicas.

![Raízes Banner](assets/hero-bg.png)

---

## 🌟 Visão Geral

O projeto **Raízes** foi desenvolvido para oferecer uma experiência premium e intuitiva de descoberta e registro familiar. Projetado para funcionar 100% no navegador e ser hospedado estaticamente no **GitHub Pages**, o sistema utiliza persistência local avançada (`localStorage`), permitindo que qualquer usuário crie e colabore sem necessidade de configurações complexas de backend.

---

## ✨ Funcionalidades Principais

### 🔒 Autenticação Descomplicada
- **Login com Google**: Simulação visual perfeita e fluida com seleção de perfis mockados para demonstração imediata.
- **Login com E-mail**: Cadastro instantâneo baseado no e-mail fornecido.

### 🌳 Gestão de Famílias e Convites
- **Criação de Família**: Gere um código único de convite automaticamente (ex: `RAIZ-2026-XYZ`).
- **Convites Inteligentes**:
  - Compartilhamento direto via **WhatsApp** com link e texto pré-formatados.
  - Compartilhamento via **E-mail** com assunto e corpo explicativo.

### ⚖️ Resolução de Conflitos (Mesclar vs Aninhar)
Quando um usuário que já possui uma árvore ativa aceita o convite de outra família, o sistema oferece duas opções poderosas de arquitetura familiar:
1. **Mesclar Famílias (Merge)**: O algoritmo compara os membros de ambas as árvores, identifica potenciais duplicatas (por nome e data de nascimento) e unifica todos em uma única grande árvore colaborativa.
2. **Criar como Subfamília (Aninhar / Branch)**: Mantém a árvore do usuário convidado intacta, anexando-a como um novo ramo (subfamília) conectado ao fundador da família anfitriã.

### 📸 Upload de Fotos Multi-fonte
O cadastro de membros suporta a inserção de fotos através de quatro modalidades:
- **Smartphone / Galeria Local**: Upload direto de arquivos de imagem (`JPG, PNG, WEBP`) convertidos instantaneamente para base64 via `FileReader`.
- **Google Photos**: Vinculação direta de links de álbuns/fotos.
- **OneDrive**: Suporte a links de compartilhamento da Microsoft.
- **iCloud**: Suporte a links de fotos da Apple.

### 🎮 Visualizador Interativo
- **Pan e Zoom**: Navegue pela árvore arrastando com o mouse ou ajustando o zoom com a roda do mouse / botões de controle.
- **Ações Rápidas**: Clique nos cartões para editar detalhes ou use o botão `+` para adicionar filhos, pais, cônjuges ou irmãos instantaneamente.

---

## 🚀 Como Executar e Hospedar no GitHub Pages

O projeto foi construído com HTML5, CSS3 Vanilla e JavaScript ES6 (Módulos), o que significa que não há etapas complexas de build.

### 💻 Execução Local
1. Clone o repositório ou abra a pasta do projeto.
2. Utilize uma extensão como **Live Server** no VS Code ou execute um servidor web simples com Python:
   ```bash
   python -m http.server 8000
   ```
3. Acesse `http://localhost:8000`.

### 🌐 Publicação no GitHub Pages
1. Inicialize o repositório Git e faça o commit dos arquivos:
   ```bash
   git init
   git add .
   git commit -m "feat: lançamento da plataforma Raízes"
   ```
2. Crie o repositório no GitHub via GitHub CLI (`gh`):
   ```bash
   gh repo create Raizes-ArvoreGenealogica --public --source=. --remote=origin
   git push -u origin main
   ```
3. No GitHub, acesse a aba **Settings > Pages**.
4. Em **Build and deployment**, selecione a branch `main` e a pasta `/ (root)`.
5. Clique em **Save**. Em poucos minutos, seu site estará no ar e acessível publicamente!

---

## 🛠️ Tecnologias Utilizadas
- **HTML5 Semântico**
- **CSS3 Vanilla** (Glassmorphism, Dark Mode, Google Fonts `Inter` e `Outfit`)
- **JavaScript ES6** (Arquitetura Modular)
- **LocalStorage API** (Persistência de Dados)

---

## 📄 Licença
Este projeto está sob a licença MIT. Sinta-se à vontade para contribuir, modificar e distribuir.
