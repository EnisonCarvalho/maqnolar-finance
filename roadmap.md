# Roadmap

## Ajuste da área do técnico — execução e valor informado
- [ ] Valor declarado separado da composição financeira, com auditoria e bloqueio após apuração
- [ ] Iniciar/concluir serviço sem exigir diagnóstico, orçamento, valor ou pagamento
- [ ] Consulta pelo administrador e apuração reutilizando os fluxos existentes
- [ ] Testes de regras, acesso do técnico TESTE e ações nas cinco larguras
- [ ] Preservar dados reais e registrar eventuais bloqueios de validação

## Passo 8B — Distribuição eventual de lucros
- [x] Migração profit_distributions + profit_distribution_payments (50/50, tetos, mês fechado, imutabilidade)
- [x] profit-math.ts + integração cashflow (pagamento sai do caixa, nunca é despesa)
- [x] Funções de servidor (aprovar, pagar com validação de saldo, estornos)
- [x] UI na página Gestão dos Sócios (aprovação com confirmação, pagamentos, histórico)
- [x] Testes automatizados (74 passando) + testes no navegador (mobile/desktop)
- [x] Limpeza dos dados de teste: estorno com justificativa dos registros identificados por ID + desativação da conta "Banco TESTE 8B" (sem exclusão, sem desativar proteções) — pedido explícito do Enison
- [x] Verificação final (build OK, 74 testes, nenhum registro de teste ativo no banco)
