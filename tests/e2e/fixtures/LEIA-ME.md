# Fixtures dos testes E2E

`foto-produto.png` — PNG 1×1 válido, 70 bytes. É a menor imagem PNG possível e serve para exercitar
o caminho de upload de foto do produto de ponta a ponta (multipart → `/app/storage` → leitura por
object URL) sem versionar binário grande.

Está versionado de propósito: um gerador em script seria mais uma peça móvel para 70 bytes, e um
teste que depende de arquivo gerado falha na primeira máquina que não rodou o gerador.
