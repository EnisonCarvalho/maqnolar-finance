# Roadmap

## Correção final — cartão concluído ATD-00015
- [ ] Reproduzir com perfil Técnico real e verificar botão diretamente no cartão de Concluídos
- [ ] Corrigir somente a interface necessária e validar abertura/edição sem salvar registros
- [ ] Validar em 360/390/430/768/1440px e informar instruções exatas, sem avançar etapas

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
