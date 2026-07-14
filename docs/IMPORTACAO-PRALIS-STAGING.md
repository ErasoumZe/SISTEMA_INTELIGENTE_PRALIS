# Importacao Pralis — Relatorio de staging

Fonte: `CADASTRO DE PRODUTOS/pralis/stack/api/src/db/base-products.json` (150 produtos, catalogo BASE).

## Mapeamento aprovado

- Catalogo BASE -> empresa **TNP** (Padaria Principal renomeada).
- Empresas **Lisboa** e **Hora** criadas; Hora sem vinculos de usuario (inativa por enquanto).
- Replica do catalogo para Lisboa: usar a feature existente de importar/exportar entre empresas.

## Status: ativo=150 · Tipo: revenda=146, transformacao=4

## Unidades a garantir no cadastro (5)

- G
- KG
- LT
- ML
- UN

## Grupos de mercadoria a garantir no cadastro (13)

- MER BEBIDAS - CERVEJAS
- MER BEBIDAS - ISOTÔNICOS
- MER BEBIDAS - REFRIGERANTES
- MER BEBIDAS - SUCOS
- MER BEBIDAS - ÁGUAS
- MER BOMBONIERI - BALAS
- MER BOMBONIERI - CHICLETES
- MER BOMBONIERI - CHOCOLATES
- MER CIGARROS - ACESSORIOS: CEDA/ISQUEIRO/ETC
- MER FAB. PRÓPRIA BASE - CORBERTURAS PRALIS
- MER FAB. PRÓPRIA BASE - RECHEIOS PRALIS
- MER MAT. PRIMA - FARINHAS
- MER MAT. PRIMA - PROTEINAS

## Nomes duplicados NA FONTE (7) — politica: primeiro vence, demais pulados

- FERRERO ROCHER (2x)
- TODDYNHO (2x)
- TALENTO CASTANHA DO PARA (2x)
- TÔNICA ANTÁRTICA (2x)
- COCA COLA PET (2x)
- COCA COLA LATA (2x)
- TIAL MANGA (3x)

## Avisos de qualidade

- Estoque minimo > maximo em 1 produto(s): TESTE (importado como esta; sem constraint no banco)
