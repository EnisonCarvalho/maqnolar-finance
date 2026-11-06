# MaqnoLar Financeiro — Arquitetura e Plano por Etapas

## 1. Situação atual do projeto (verificado)
- Projeto em branco: React 19 + TypeScript + TanStack Start, Tailwind v4, componentes shadcn.
- Nenhum backend conectado ainda. Nenhuma tabela, login ou integração existe.
- Proposta: ativar o **Lovable Cloud** (PostgreSQL gerenciado, autenticação, armazenamento, funções de servidor e RLS), sem contas externas.

## 2. Arquitetura
```text
Navegador (React)  ──>  Funções de servidor (validação + regras financeiras)
       │                         │
       └── leituras com RLS ─────┴──> PostgreSQL (Lovable Cloud)
                                       - RLS em todas as tabelas
                                       - funções SQL seguras (cálculo, acerto)
                                       - trilha de auditoria por gatilhos
```
- Uma única aplicação, duas áreas: **/admin** (Enison, Jonathan) e **/tecnico** (técnicos).
- Leituras simples: direto do banco, protegidas por RLS.
- Escritas financeiras: somente por funções de servidor/SQL que calculam valores no servidor (o navegador nunca envia o valor final da participação).

## 3. Tabelas propostas

### Pessoas e acesso
- `profiles` (id = usuário, nome, telefone, preferência de tema: claro/escuro/auto)
- `user_roles` (user_id, role: `admin` | `tecnico`) — papéis em tabela separada
- `technicians` (id, profile_id opcional, nome, documento, chave PIX, ativo, criado/desativado em)
- `partners` (sócios: id, profile_id, percentual societário, ativo)

### Catálogo (com desativação, nunca exclusão)
- `equipment_types` (Geladeira, Máquina de Lavar, Tanquinho, Freezer, Gelágua, Frigobar, Purificador, Ar-condicionado; ativo)
- `services` (nome, equipment_type_id, preço sugerido, ativo)
- `split_rules` (regras de participação versionadas: tipo [visita | mão de obra], % ou valor técnico, % ou valor empresa, válida_de, válida_até)
  - Ex.: visita R$ 30 = 20 técnico / 10 empresa; mão de obra 50/50.

### Operação
- `customers` (nome, telefone, endereço, origem/campanha)
- `service_orders` (atendimentos: cliente, técnico, equipamento, campanha, status [agendado, visita realizada, orçamento enviado, aprovado, recusado, concluído, cancelado], data agendada, `visit_converted` boolean)
- `service_order_items` (peças e mão de obra: tipo, descrição, qtd, valor, `purchased_by` [técnico | empresa], custo real)
- `order_financials` (snapshot imutável do cálculo ao concluir: total, peças, mão de obra, parte técnico, parte empresa, split_rule_id usada, versão)

### Dinheiro
- `bank_accounts` (nome, banco, tipo, saldo inicial, ativo)
- `payments` (recebimentos do cliente: service_order_id, valor, forma, `received_by` [técnico | empresa], conta, data)
- `expenses` (categoria, valor, conta, data, campanha opcional, comprovante)
- `expense_categories`
- `ledger_entries` (livro-razão de dupla entrada: data, conta/parte [empresa, técnico X, sócio Y, banco Z], débito/crédito, origem [payment, expense, settlement, ...], origem_id) — fonte única para fluxo de caixa e saldos
- `settlements` (acertos diários: técnico, data, status [aberto, fechado, pago], totais) + `settlement_lines` (linhas vinculadas a cada atendimento/pagamento/reembolso)

### Gestão
- `campaigns` (nome, canal, período, investimento) → ROI = receita dos atendimentos vinculados / gasto
- `partner_withdrawals` (pró-labore e retiradas por sócio)
- `investments` (descrição, valor, data, conta)
- `activity_log` (quem, quando, tabela, registro, ação, antes/depois em JSON)
- Futuro: `warranties` (notas de garantia vinculadas ao atendimento)

## 4. Relacionamentos-chave
```text
customer 1─N service_order N─1 technician
service_order 1─N service_order_items (peças: compradas por técnico ou empresa)
service_order 1─N payments (recebido por técnico ou empresa)
service_order 1─1 order_financials (snapshot do cálculo + regra usada)
payments / expenses / settlements ──> ledger_entries ──> bank_accounts
technician 1─N settlements 1─N settlement_lines ─> (order / payment / item)
campaign 1─N service_order ; campaign 1─N expenses
```
**Lógica do acerto diário (por técnico):**
saldo = parte do técnico + reembolso de peças que ele comprou − valores do cliente que ele recebeu − peças que a empresa comprou e já estão no valor dele.
Positivo: empresa paga o técnico. Negativo: técnico repassa à empresa.

**Visita convertida:** ao aprovar o orçamento, a visita é marcada convertida e não gera cobrança/participação própria; a regra de mão de obra assume.

## 5. Autenticação e RLS
- Login por e-mail e senha; cadastro público desativado — admins convidam usuários.
- Função `has_role(user, role)` segura (evita recursão).
- Regras:
  - Admin: acesso total a tudo.
  - Técnico: lê apenas `service_orders` onde `technician.profile_id = auth.uid()`, seus itens, pagamentos, snapshots e acertos. Sem acesso a despesas, contas, campanhas, sócios, investimentos e regras.
  - Técnico pode atualizar apenas campos operacionais do próprio atendimento (status, itens, registro de recebimento) via função de servidor.
  - `ledger_entries`, `order_financials`, `activity_log`: nenhum usuário edita ou exclui diretamente — somente inserção pelas funções seguras.

## 6. Operações em funções seguras no servidor
- Concluir atendimento e gerar snapshot financeiro (aplica a regra vigente).
- Converter visita em serviço aprovado.
- Registrar pagamento do cliente / compra de peça.
- Gerar, fechar e pagar acerto diário (transação única, com bloqueio).
- Estornos (lançamento inverso, nunca apagar).
- Alterar regras de participação (cria nova versão).
- Convidar usuário e definir papel.
- Proteção contra duplicidade: chaves de idempotência, restrições únicas (ex.: um acerto por técnico/dia, um snapshot por atendimento), valores em centavos (inteiros).

## 7. Preservação do histórico
- Nada financeiro é excluído: cancelamentos geram estornos.
- Cadastros usam "ativo/inativo".
- Regras de participação versionadas; cada snapshot guarda a regra usada.
- Acertos fechados ficam bloqueados.
- Gatilhos de auditoria gravam antes/depois de toda alteração.

## 8. Interface
- Layout SaaS com menu lateral recolhível, cards de indicadores, gráficos (Recharts), responsivo.
- Tema claro/escuro/automático salvo no perfil do usuário.
- Filtro global de período (dia, semana, mês, trimestre, semestre, ano, personalizado) com comparação ao período anterior e filtros combinados (técnico, equipamento, campanha, conta, status).

## 9. Limitações, custos e integrações
- Lovable Cloud tem uso gratuito inicial e cobrança por uso acima dele; volume esperado é baixo.
- Sem integração bancária automática (Open Finance) nesta fase — lançamentos manuais ou importação CSV/OFX depois.
- Notas de garantia / NFS-e: exigem provedor externo futuramente.
- WhatsApp/Google Agenda: possíveis integrações futuras.
- Relatórios PDF/Excel: gerados no navegador.

## 10. Etapas de desenvolvimento
1. Ativar Lovable Cloud, autenticação, papéis, perfis, layout com menu lateral e temas.
2. Cadastros: técnicos, equipamentos, serviços, clientes, regras de participação.
3. Atendimentos e agenda (área admin e área do técnico).
4. Motor financeiro: itens, pagamentos, snapshot, livro-razão, auditoria.
5. Acerto diário dos técnicos.
6. Receitas, despesas, contas bancárias, fluxo de caixa.
7. Campanhas e ROI, sócios e pró-labore, investimentos.
8. Dashboard, filtros de período, comparações e relatórios.
9. Histórico de atividades, configurações e preparação para notas de garantia.

Cada etapa será entregue somente após sua autorização.
