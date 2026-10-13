# RaspiMirror

Espelho inteligente para Raspberry Pi: um ecrã atrás de um vidro espião, com fundo preto puro (fica invisível) e informação útil à volta da tua cara.

**Tudo é gratuito e não precisa de chaves de API.** Usa Open-Meteo, IPMA, Wikipédia e RSS dos jornais, e para a IA usa o Ollama a correr localmente.

## O que mostra

| Zona | Conteúdo |
|---|---|
| **Relógio** | Hora com segundos, data, semana do ano, nascer e pôr do sol (com quanto o dia cresce ou encurta) e fase da lua desenhada à escala |
| **O teu dia** | Conselhos práticos: que roupa vestir, a que horas começa a chuva, UV alto, rajadas, geada, se amanhã fica mais frio, bom dia de praia, pólen, feriado amanhã… Inclui um resumo opcional feito pela IA local |
| **Agenda** | Os teus calendários iCal (Google, Outlook, iCloud…), feriados nacionais, aniversários, mini-calendário do mês e contagens decrescentes. Mostra “agora” e “em 20 min” |
| **Meteorologia** | Estado atual, sensação térmica, vento com direção, humidade, UV, qualidade do ar, pressão, pólen, *nowcast* de chuva a 15 min e avisos do IPMA (amarelo, laranja, vermelho) |
| **Próximas horas** | 24 h com ícones, curva de temperatura e probabilidade de chuva |
| **Próximos dias** | 7 dias com barras de amplitude térmica (estilo iOS) |
| **Mar** | Ondulação, período, direção, temperatura da água, preia-mar e baixa-mar com curva de maré |
| **Centro** | Frases que mudam com a hora, o tempo e o dia (feriados, aniversários), mensagens enviadas do telemóvel, respostas da IA e temporizador |
| **Notas** | Tarefas e notas geridas pelo telemóvel; sem notas aparece o QR do comando |
| **Neste dia** | Efemérides da Wikipédia em português |
| **Notícias** | Manchetes de RTP, Observador e Público em rotação (configurável) |
| **Estado** | Temperatura do CPU, RAM, carga, disco, uptime, IP e estado da IA |

### Comando remoto (telemóvel)

Abre `http://IP-DO-PI:3000/remote` no telemóvel, ou lê o QR que aparece no espelho. A partir daí podes:

- Mudar o ecrã para auto, dia, noite ou desligado
- Enviar mensagens para o espelho
- Gerir notas e tarefas
- Usar temporizadores (incluindo “2 min · dentes”)
- Fazer perguntas à IA, com a resposta a aparecer no espelho
- Mudar todas as definições: cidade (com pesquisa), praia, distrito IPMA, calendários, datas, feeds, horário noturno, módulos visíveis e frases personalizadas

As alterações aparecem no espelho na hora, através de Server-Sent Events.

### Pensado para estar ligado 24 h por dia

- **Modo noturno automático**: escurece e simplifica o ecrã.
- **Proteção contra burn-in**: o conteúdo move-se alguns píxeis a cada 4 min.
- **Cache no servidor**: se a internet falhar, o espelho continua a mostrar os últimos dados.
- **Recarga automática** quando editas os ficheiros, e uma vez por dia às 04:00.
- **Funciona na vertical e na horizontal**, e escala sozinho para qualquer resolução.

## Instalar

```bash
cd /var/www/html/raspimirror/raspimirror-backend
npm install
npm start
```

Abre `http://localhost:3000`. O backend também serve o frontend, por isso o Apache não é necessário.

### Arrancar sozinho no Raspberry Pi

```bash
sudo cp deploy/raspimirror.service /etc/systemd/system/   # ajusta o User=
sudo systemctl daemon-reload && sudo systemctl enable --now raspimirror
```

Kiosk (Chromium em ecrã inteiro): segue as instruções no topo de `deploy/kiosk.sh`.

Para rodar o ecrã para a vertical no Raspberry Pi OS Bookworm, vai a *Screen Configuration* → *Orientation*.

### Assistente com IA (opcional, gratuito)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2        # num Pi 4 com 4 GB experimenta: ollama pull llama3.2:1b
```

Se o Ollama correr noutro computador da rede, define `OLLAMA_URL=http://IP:11434` no `.env`.

### Opções no `.env`

```ini
PORT=3000
REMOTE_PIN=1234             # opcional: pede PIN no comando remoto
OLLAMA_URL=http://localhost:11434
```

### Segurança

Se usas o Apache, ativa `deploy/apache-raspimirror.conf` para não expor o `.env` nem o `.git`. As instruções estão dentro do ficheiro.
