# Câmbio Turbo

Extensão para Firefox e Chrome: **selecione um preço em qualquer site** e um balão mostra na hora quanto ele
vale em reais (ou na moeda que você escolher). Clique no valor do balão para copiar.

Tema do Subaru, igual ao das outras extensões: azul-marinho (padrão), **preto** ou claro. O botão de tema no
menu passa por eles, e o balão nas páginas segue o tema escolhido.

## O que ela entende

- Símbolos e códigos: `US$ 49,99`, `$49.99`, `€ 1.299,00`, `1.299,00 €`, `£12.50`, `¥1,000`, `100 USD`, `R$`, `CA$`, `AR$`, `S/`, `zł`, `kr`… (mais de 160 moedas).
- Os dois jeitos de escrever número: `1.234,56` e `1,234.56` (e também `1 234,56` e `1'234.50`).
- Por extenso: `20 dólares`, `50 euros`, `100 pesos argentinos`, `1,5 milhão de dólares`, `US$ 2 bi`, `$4K`.
- Faixas e listas: `US$ 10–20` e `£12.50, ¥1,000 e 20 dólares` viram uma linha para cada valor.
- Duplo clique só no número: se o `$` está do lado (fora da seleção), ela acha mesmo assim.
- Texto selecionado dentro de campos de formulário.
- Valores que já estão na sua moeda (R$) e números sem moeda ("Lei 8.112") são ignorados.

### "$" de que país?

O `$` sozinho pode ser dólar americano, canadense, australiano, peso argentino, mexicano, chileno…
A extensão descobre pelo endereço e pelo idioma do site (`.com.ar` → peso argentino, `.ca` → dólar canadense,
senão dólar americano). Se errar, troque na listinha do próprio balão (`USD ▾`) ou no menu, em **Neste site**:
a escolha fica guardada para aquele site. O mesmo vale para `¥` (iene ou yuan) e `kr` (coroas).

## Menu (ícone na barra)

- **Conversor rápido:** digite um valor, escolha as moedas e use o botão ⇅ para inverter.
- **Mostrar em:** a sua moeda (Real brasileiro por padrão).
- **Somar IOF do cartão:** mostra também o valor com a taxa (3,5% por padrão; dá para mudar a porcentagem).
- **Neste site:** desligar a conversão só naquele site e dizer de que país é o `$` dele.
- **Botão de ligar/desligar** (canto de cima) e **botão de tema** (azul-marinho → preto → claro).
- No rodapé, a data da cotação e o botão de atualizar.

## Cotações

Vêm da [ExchangeRate-API](https://www.exchangerate-api.com) (grátis, sem cadastro), com a
[Currency API](https://github.com/fawazahmed0/exchange-api) de reserva. São cotações comerciais atualizadas uma vez
por dia; o banco/cartão cobra um pouco mais (spread + IOF). A extensão só baixa a tabela de cotações: nada do que
você seleciona sai do seu computador.

## Instalar

**Firefox Developer Edition:** `about:addons` → engrenagem ⚙ → **Instalar extensão a partir de arquivo…** →
escolha `cambio-turbo-firefox-<versão>.xpi` (fica em Documentos e em `dist/`) → **Adicionar**.
Se o menu mostrar o aviso **"Permitir acesso"**, clique nele e recarregue as abas abertas.
Para testar sem instalar: `about:debugging#/runtime/this-firefox` → **Carregar extensão temporária…** → `firefox/manifest.json`.

**Chrome:** `chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → escolha a pasta `Cambio Turbo`.

As abas que já estavam abertas antes de instalar precisam ser recarregadas (F5) para o balão aparecer nelas.

## Estrutura

```
manifest.json            Manifesto do Chrome (service worker)
moedas.js                Acha os preços no texto, converte e formata (usado pelas páginas e pelo menu)
content.js               Balão que aparece ao selecionar um preço
background.js            Baixa e guarda as cotações
popup/                   Menu: conversor, sua moeda, IOF, ajustes do site e tema
icons/                   Ícones (gerados pelo ..\gerar-icones-subaru.ps1)
firefox/                 Versão do Firefox (manifest próprio + cópia do código)
sincronizar-firefox.ps1  Copia o código atualizado para firefox/
empacotar.ps1            Gera dist/ (.zip do Chrome e .xpi do Firefox) e copia o .xpi para Documentos
```

Antes de gerar um pacote novo, suba a `version` nos dois `manifest.json`.

## Baixar e licença

O `.xpi` (Firefox) e o `.zip` (Chrome) de cada versão ficam em
[Releases](https://github.com/ailtoncja/cambio-turbo/releases). Código sob a licença MIT (veja `LICENSE`).
