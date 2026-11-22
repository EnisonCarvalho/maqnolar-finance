# Roadmap

## Correção de OS confirmada e versões de notas — 22/11/2026
- [x] Reutilizar Editar para correção administrativa atômica, sem mudar status, com confirmação, motivo e histórico; declaração original do técnico preservada.
- [x] Recalcular a apuração existente pela regra da OS e preservar versões anteriores da nota com o mesmo número; Ver/Baixar compartilham a versão atual nas duas telas.
- [x] 152 testes passaram; regressão SQL fictícia desfeita validou 500/200, correção 600/200, ausência de duplicidade/pagamentos, versões e leitura/bloqueio do técnico. Contagens finais: 32 OS, 31 clientes e 6 notas, nenhum registro fictício restante. Interface autenticada simulada em 360/390/430/768/1440px: editar, confirmar, reabrir, baixar PDF atual no detalhe e na Gestão e consultar versões; PDF nítido com logo/rubrica e único valor; build OK. Gravação pela interface foi simulada; persistência foi validada separadamente na transação desfeita.

## Financeiro em planilha e reset único — 18/11/2026
- [x] Simplificar Receitas por OS, Despesas sem escolha de conta e Caixa efetivo da participação MaqnoLar.
- [x] Retirar Acerto e Contas do painel, preservar área técnica e rotinas anteriores; lista compartilhada já exclui OS arquivadas.
- [x] Reset atômico por IDs: 4 OS (2 já arquivadas), 2 clientes, 2 recebimentos R$230, 1 pagamento/despesa R$114; 4 apurações R$760, participação MaqnoLar R$255. Auditoria identifica Enison.
- [x] 122 testes aprovados, exemplos sem persistência, Receitas/Despesas/Caixa/Dashboard/Relatórios autenticados em 360/390/430/768/1440px, filtros e abertura de Nova despesa verificados sem salvar. Banco: 0 clientes/OS ativos, nenhuma apuração/obrigação/pagamento antigo ativo; telas monetárias zeradas. Build OK.
- [ ] Gravação de nova despesa sem conta não exercitada no site: preservar o estado final zerado sem criar registros fictícios; validações existentes e conta interna conferidas.

## Revisão final para uso real
- [x] 97 testes aprovados; build sem erros
- [x] Dashboard/relatórios/atendimentos validados como admin em 390/1440px, sem duplicidade nos valores
- [x] Acesso do técnico TESTE validado: vê só seus atendimentos, botão "Informar valor cobrado" presente, páginas admin bloqueadas
- [x] Registros fictícios identificados (ATD-00015, ATD-00016, pagamentos, peças, repasse ao técnico TESTE) — nada alterado; relatório entregue ao usuário
- [x] Tela branca vista em uma execução foi instabilidade transitória do servidor de desenvolvimento; repetição carregou completo sem erros

## Confirmação simplificada de serviços
- [x] Reutilizar apuração existente com botão destacado antes dos orçamentos e formulário de total/peças/divisão automática
- [x] Impedir repetição da confirmação inicial sob bloqueio de atendimento, preservar correções auditadas e controles opcionais de caixa
- [x] Atualizar contagem de confirmados e participações no dashboard/relatórios; faturamento já usa a composição sem exigir pagamentos
- [x] 97 testes aprovados; formulário em 360/390/430/768/1440px com respostas simuladas somente no navegador, páginas reais de dashboard/relatórios validadas com sessão admin; build OK
- [ ] Gravação ponta a ponta em banco: não executada, pois não há serviço concluído pendente além dos dados existentes e alterações nesses registros foram proibidas; nenhum dado alterado

## Correção final — cartão concluído ATD-00015
- [x] Sessão real TESTE: botão já renderizava no ATD-00015; ausência relatada não reproduzida
- [x] Botão destacado como ação principal imediatamente abaixo do código/status; campo abre e permite digitar, cancelado sem salvar
- [x] Cartão de Concluídos e detalhe validados em 360/390/430/768/1440px sem overflow/erros; 6 testes relevantes aprovados e build OK

## Ajuste da área do técnico — execução e valor informado
- [x] Correção solicitada: botão explícito "Informar valor cobrado" no cartão e no detalhe; conta TESTE validada em 360/390/430/768/1440px, abrindo campo, digitando e cancelando sem gravar
- [x] Valor declarado separado da composição financeira, com auditoria e bloqueio após apuração
- [x] Iniciar/concluir serviço sem exigir diagnóstico, orçamento, valor ou pagamento
- [x] Consulta pelo administrador e apuração reutilizando os fluxos existentes
- [x] 92 testes automatizados; consulta/formulário admin verificados em 360/390/430/768/1440px sem salvar, sem overflow ou erros
- [ ] Gravação e confirmação financeira ponta a ponta: não executadas nesta revisão porque o usuário proibiu alterações de registros; testes automatizados aprovados, interface validada com sessão real TESTE
- [x] Nenhum atendimento, pagamento ou configuração existente alterado durante os testes; sem exclusões ou proteções desativadas

## Passo 8B — Distribuição eventual de lucros
- [x] Migração profit_distributions + profit_distribution_payments (50/50, tetos, mês fechado, imutabilidade)
- [x] profit-math.ts + integração cashflow (pagamento sai do caixa, nunca é despesa)
- [x] Funções de servidor (aprovar, pagar com validação de saldo, estornos)
- [x] UI na página Gestão dos Sócios (aprovação com confirmação, pagamentos, histórico)
- [x] Testes automatizados (74 passando) + testes no navegador (mobile/desktop)
- [x] Limpeza dos dados de teste: estorno com justificativa dos registros identificados por ID + desativação da conta "Banco TESTE 8B" (sem exclusão, sem desativar proteções) — pedido explícito do Enison
- [x] Verificação final (build OK, 74 testes, nenhum registro de teste ativo no banco)
