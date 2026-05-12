# Escopo do Backoffice — BR Gorjeta

**Versão:** 2.0
**Data:** 01/04/2026
**Fonte:** Transcrição de reunião de alinhamento + estrutura de banco de dados

---

## 1. Módulo: Cadastro de Restaurante (`crd_cliente`)

### 1.1 Descrição

Gerenciamento completo do cadastro de restaurantes clientes da BR Gorjeta. Permite inclusão, edição, consulta e bloqueio. A listagem é ordenada por nome fantasia.

### 1.2 Estrutura de Dados

| # | Campo BD | Nome Exibição | Tipo | Obrigatório | Editável | Observações |
|---|----------|---------------|------|:-----------:|:--------:|-------------|
| 1 | `crd_cli_id` | ID | Integer (PK) | Automático | Não | Identificador único, gerado automaticamente |
| 2 | `crd_cli_razao_social` | Razão Social | Texto | Sim | Sim | — |
| 3 | `crd_cli_nome_fantasia` | Nome Fantasia / Restaurante | Texto | Sim | Sim | Utilizado como nome de exibição na listagem e na ordenação |
| 4 | `crd_cli_cnpj` | CNPJ | Texto (formatado) | Sim | Sim | Identificador fiscal único do restaurante |
| 5 | `crd_sit_id` | Situação | Integer (FK → `crd_situacao`) | Sim | Sim | Referência à tabela de situações. Exibe o logo/ícone da situação (`crd_sit_logo`) |
| 6 | `crd_cid_id` | Cidade | Integer (FK) | Sim | Sim | Referência à tabela de cidades |
| 7 | `crd_cli_obs_geral` | Observação Geral | Texto longo | Não | Sim | Campo livre para anotações, justificativas ou informações complementares |
| 8 | `crd_cli_manutencao_usuario` | Manutenção de Usuário | Texto / Flag | Sim | Sim | Indica o usuário responsável pela manutenção do cadastro do restaurante |
| 9 | `insert_date` | Data de Cadastro | Datetime | Automático | Não | Preenchida automaticamente no momento da inclusão |

### 1.3 Relacionamentos

| Tabela Relacionada | Chave | Tipo de Join | Finalidade |
|--------------------|-------|:------------:|------------|
| `crd_situacao` | `crd_sit_id` | LEFT JOIN | Obter o ícone/logo da situação (`crd_sit_logo`) para exibição na listagem |

### 1.4 Regras de Negócio — Restaurante

| ID | Regra | Detalhamento |
|----|-------|--------------|
| RT-01 | Cadastro manual | O cadastro de restaurantes é realizado manualmente pelo operador do backoffice |
| RT-02 | ID automático | O `crd_cli_id` é gerado automaticamente pelo sistema e não pode ser editado |
| RT-03 | Data de cadastro automática | O campo `insert_date` é preenchido automaticamente na criação e não pode ser alterado |
| RT-04 | CNPJ único | O CNPJ deve ser único no sistema; não é permitido cadastrar dois restaurantes com o mesmo CNPJ |
| RT-05 | Situação via tabela de referência | A situação do restaurante é controlada por FK para `crd_situacao`, permitindo estados como Ativo, Bloqueado, etc., cada um com seu ícone/logo próprio |
| RT-06 | Observação como justificativa | O campo `crd_cli_obs_geral` pode ser utilizado para registrar o motivo de bloqueio ou qualquer outra informação relevante sobre o cliente |
| RT-07 | Manutenção de usuário | O campo `crd_cli_manutencao_usuario` registra o usuário responsável pela manutenção do cadastro do restaurante |
| RT-08 | Listagem ordenada | A listagem de restaurantes é ordenada alfabeticamente por nome fantasia (`crd_cli_nome_fantasia`) |
| RT-09 | Vinculação obrigatória com usuário | Após inserir o restaurante, é necessário criar ao menos um usuário de acesso ao Portal RH para que o restaurante possa operar |

---

## 2. Módulo: Usuários do Portal (`fr_usuario`)

### 2.1 Descrição

Gestão dos usuários que acessam o Portal RH de cada restaurante. Cada usuário é vinculado a um restaurante e pode ter controle de expiração de acesso, autenticação em dois fatores e perfil de permissão via sistema.

### 2.2 Estrutura de Dados

| # | Campo BD | Nome Exibição | Tipo | Obrigatório | Editável | Observações |
|---|----------|---------------|------|:-----------:|:--------:|-------------|
| 1 | `usr_codigo` | Código / ID | Integer (PK) | Automático | Não | Identificador único do usuário |
| 2 | `usr_login` | Login | Texto | Sim | Sim | Identificador de acesso ao portal |
| 3 | `usr_senha` | Senha | Texto (hash MD5) | Sim | Sim | Armazenada como MD5 da concatenação `usr_codigo` + senha definida |
| 4 | `usr_nome` | Nome Completo | Texto | Sim | Sim | — |
| 5 | `usr_email` | E-mail | Texto | Sim | Sim | Utilizado para comunicação e envio de senha temporária |
| 6 | `usr_celular` | Celular | Texto (formatado) | Sim | Sim | — |
| 7 | `usr_cpf` | CPF | Texto (formatado) | Sim | Sim | — |
| 8 | `usr_cargo` | Cargo | Texto | Sim | Sim | Cargo do usuário dentro do restaurante |
| 9 | `usr_data_de_nascimento` | Data de Nascimento | Date | Sim | Sim | — |
| 10 | `crd_cli_id` | Restaurante | Integer (FK → `crd_cliente`) | Sim | Não | Vincula o usuário a um restaurante específico |
| 11 | `usr_administrador` | Administrador | Booleano / Flag | Sim | Sim | Indica se o usuário tem perfil de administrador |
| 12 | `usr_tipo_expiracao` | Tipo de Expiração | Texto / Enum | Sim | Sim | Define a política de expiração de senha (ex: por dias, por data, nunca) |
| 13 | `usr_dias_expiracao` | Dias para Expiração | Integer | Condicional | Sim | Número de dias até a senha expirar. Obrigatório quando o tipo de expiração é por dias |
| 14 | `usr_inicio_expiracao` | Início da Expiração | Date | Condicional | Sim | Data de referência para o cálculo da expiração |
| 15 | `usr_forma_2fa` | Forma de 2FA | Texto / Enum | Não | Sim | Método de autenticação em dois fatores (ex: e-mail, SMS, nenhum) |
| 16 | `insert_date` | Data de Cadastro | Datetime | Automático | Não | Preenchida automaticamente na criação |

### 2.3 Relacionamentos

| Tabela Relacionada | Chave | Tipo de Join | Finalidade |
|--------------------|-------|:------------:|------------|
| `crd_cliente` | `crd_cli_id` | — | Vincular o usuário ao restaurante |
| `fr_usuario_sistema` | `usr_codigo` | LEFT JOIN | Verificar se o usuário tem acesso ao sistema (`uss_acessar = 'S'`) |
| `crd_situacao` | `crd_sit_id` (derivado) | LEFT JOIN | A situação é derivada: se `uss_acessar = 'S'` → situação 1 (Ativo); senão → situação 2 (Inativo). Exibe o ícone correspondente (`crd_sit_logo`) |

### 2.4 Regras de Negócio — Usuários do Portal

| ID | Regra | Detalhamento |
|----|-------|--------------|
| UP-01 | Vinculação obrigatória a restaurante | Todo usuário deve estar vinculado a exatamente um restaurante via `crd_cli_id` |
| UP-02 | Senha com hash MD5 | A senha é armazenada como `MD5(usr_codigo + senha_definida)`. Isso significa que o ID do usuário é concatenado com a senha em texto plano e o resultado é submetido ao algoritmo MD5 |
| UP-03 | Senha temporária no primeiro acesso | Ao criar o usuário, uma senha temporária é gerada e enviada por e-mail. No primeiro login, o sistema obriga a troca |
| UP-04 | Redefinição de senha pelo backoffice | O operador pode clicar em "Redefinir Senha", disparando o envio de senha temporária por e-mail com troca obrigatória no próximo login |
| UP-05 | Situação derivada do acesso ao sistema | A situação (Ativo/Inativo) **não** é um campo direto do usuário — é derivada da tabela `fr_usuario_sistema`: se `uss_acessar = 'S'`, o usuário é Ativo (situação 1); caso contrário, é Inativo (situação 2) |
| UP-06 | Controle de expiração de senha | O sistema suporta políticas de expiração configuráveis por usuário. O campo `usr_tipo_expiracao` define o tipo, `usr_dias_expiracao` define o prazo, e `usr_inicio_expiracao` marca o ponto de partida |
| UP-07 | Autenticação em dois fatores (2FA) | O campo `usr_forma_2fa` permite configurar o método de segundo fator de autenticação para o usuário |
| UP-08 | Flag de administrador | O campo `usr_administrador` indica se o usuário possui privilégios de administrador dentro do Portal RH do restaurante |
| UP-09 | Múltiplos usuários por restaurante | Um restaurante pode ter vários usuários, cada um com suas próprias configurações de acesso, expiração e permissões |
| UP-10 | Bloqueio e ativação | O controle de bloqueio/ativação é feito via `fr_usuario_sistema.uss_acessar`, alternando entre 'S' (ativo) e 'N' (inativo) |
| UP-11 | Edição por seleção | Para editar um usuário, o operador clica sobre o registro na listagem, abrindo os dados para modificação |

---

## 3. Fluxos Operacionais

### 3.1 Fluxo: Cadastro de Novo Restaurante

```
1. Operador acessa módulo Restaurantes → Clica em "Incluir"
2. Preenche: Razão Social, CNPJ, Nome Fantasia, Cidade, Manutenção de Usuário
3. Define a Situação (FK → crd_situacao)
4. Opcionalmente preenche Observação Geral
5. insert_date = gerada automaticamente
6. crd_cli_id = gerado automaticamente
7. Grava o restaurante
8. Acessa aba "Usuários" do restaurante recém-criado
9. Cria ao menos um usuário para acesso ao Portal RH (ver fluxo 3.2)
```

### 3.2 Fluxo: Cadastro de Novo Usuário do Portal

```
1. Operador acessa o restaurante → Aba "Usuários" → Clica em "Novo Usuário"
2. Preenche: Login, Nome, E-mail, Celular, CPF, Cargo, Data de Nascimento
3. Define: Administrador (S/N), Tipo de Expiração, Dias/Início Expiração, Forma de 2FA
4. Define senha temporária
5. Sistema grava o usuário → usr_codigo gerado automaticamente
6. Sistema calcula a senha: MD5(usr_codigo + senha_definida)
7. Cria registro em fr_usuario_sistema com uss_acessar = 'S' (ativo)
8. Envia e-mail com credenciais temporárias
9. No primeiro acesso, o usuário é obrigado a trocar a senha
```

### 3.3 Fluxo: Reset de Senha

```
1. Operador localiza o usuário na listagem
2. Clica em "Redefinir Senha"
3. Sistema gera nova senha temporária
4. Recalcula o hash: MD5(usr_codigo + nova_senha_temporária)
5. Envia e-mail com nova senha temporária
6. No próximo login, sistema força troca de senha
7. Nova senha final armazenada como MD5(usr_codigo + senha_escolhida)
```

---

## 4. Regras Gerais do Sistema

| ID | Regra | Detalhamento |
|----|-------|--------------|
| SG-01 | Separação de responsabilidades | O backoffice gerencia cadastros e suporte; o Portal RH dá autonomia ao restaurante; o Portal Financeiro (instituição financeira) controla movimentações |
| SG-02 | Dados financeiros segregados | Movimentações financeiras (cartão, PIX, boleto) ficam em ambiente separado com padrões de segurança do Banco Central |
| SG-03 | Hash de senha com salt por ID | Todas as senhas utilizam o `usr_codigo` como salt, concatenado antes do hash MD5, garantindo que senhas iguais para usuários diferentes gerem hashes diferentes |
| SG-04 | Situações centralizadas | A tabela `crd_situacao` centraliza os estados possíveis (Ativo, Bloqueado, etc.) com seus respectivos ícones, sendo reutilizada tanto para restaurantes quanto para derivar situação de usuários |
