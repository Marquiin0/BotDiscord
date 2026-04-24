const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  MessageFlags,
  ComponentType,
  PermissionsBitField,
} = require('discord.js')

const { Op } = require('sequelize')
const path = require('path')
const config = require('../config')
const { attachImage } = require('../utils/attachImage')
const { UserPontos, UserActions, Bet } = require('../database')

// Calcula ROI (Odds)
function calcularROI(totalOpcao, totalOutra) {
  if (totalOpcao === 0) return 1.0
  return (totalOpcao + totalOutra) / totalOpcao
}

// Remove prefixos do título para evitar repetição
function limparTituloBase(titulo) {
  return titulo
    .replace(
      /^(\u23F0 Aposta FECHADA( Automaticamente)?:\s*|🎲 Aposta:\s*|🏆 Aposta ENCERRADA:\s*)/i,
      '',
    )
    .trim()
}

/**
 * Fecha aposta automaticamente (caso ainda não esteja encerrada),
 * e edita o embed para "FECHADA AUTOMATICAMENTE", mantendo:
 * - O horário original no description (oldEmbed.description)
 * - O thumbnail configurado
 * - Desabilitando apenas os botões de apostar
 */
async function autoCloseBet(betDB, client) {
  if (!betDB || betDB.encerrada) return

  betDB.encerrada = true
  await betDB.save()

  const channel = await client.channels.fetch(betDB.channelId).catch(() => null)
  if (!channel) return
  const msg = await channel.messages.fetch(betDB.messageId).catch(() => null)
  if (!msg) return

  const oldEmbed = msg.embeds[0]
  if (!oldEmbed) return

  // Mantém horário e thumbnail
  const baseTitle = limparTituloBase(oldEmbed.title ?? '')
  const embedFechada = EmbedBuilder.from(oldEmbed)
    .setColor(0xa0a0a0)
    .setTitle(`🕛 Aposta FECHADA Automaticamente: ${baseTitle}`)
    .setThumbnail(
      'https://media.discordapp.net/attachments/1344438558311841842/1350707247214493726/CAMPIN_BET_COL.png?ex=67d7b7a6&is=67d66626&hm=d7fcca1f10b88ddab11a26ce9ea0527364f7c29cb9a72c17419bcd7bda71c86b&=&format=webp&quality=lossless&width=1001&height=856',
    )
    .setDescription(
      oldEmbed.description +
        `\n\nAs apostas foram encerradas **no horário** definido.\n` +
        `Agora, **somente** o botão "Finalizar Aposta" está habilitado.\n` +
        `Use-o para escolher o vencedor e distribuir pontos!`,
    )
    .setTimestamp()

  // Desabilita botões de apostar, mantendo "Finalizar"
  const oldComponents = msg.components
  const newComponents = []
  let btnIdx = 0

  for (const rowComp of oldComponents) {
    const newRow = new ActionRowBuilder()
    for (const comp of rowComp.components) {
      if (comp.type === ComponentType.Button) {
        if (comp.customId.startsWith('aposta_escolha_')) {
          btnIdx++
          const btn = ButtonBuilder.from(comp)
            .setCustomId(`aposta_fechada_${betDB.id}_${btnIdx}`)
            .setDisabled(true)
          newRow.addComponents(btn)
        } else {
          newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true))
        }
      } else {
        newRow.addComponents(comp)
      }
    }
    newComponents.push(newRow)
  }

  try {
    await msg.edit({
      embeds: [embedFechada],
      components: newComponents,
    })
  } catch (err) {
    // Se falhar ao editar (ex: mensagem antiga com formato inválido), apenas loga
    console.error(`Erro ao editar mensagem da aposta ${betDB.id}:`, err.message)
  }
}

/**
 * Função para encerrar apostas expiradas no BD,
 * caso o bot tenha sido reiniciado e perdido o setTimeout.
 * Chame no ready.js a cada X tempo (setInterval).
 */
async function closeExpiredBetsOnReady(client) {
  const agora = new Date()
  const betsExpiradas = await Bet.findAll({
    where: {
      encerrada: false,
      expiryTime: { [Op.lt]: agora },
    },
  })

  for (const bet of betsExpiradas) {
    try {
      await autoCloseBet(bet, client)
    } catch (err) {
      console.error(`Erro ao auto-encerrar aposta (id=${bet.id}):`, err)
    }
  }
}

module.exports = {
  name: Events.InteractionCreate,
  closeExpiredBetsOnReady,

  async execute(interaction) {
    if (interaction.deferred || interaction.replied) return

    // ============================================================
    // 1) CLIQUES EM BOTÕES
    // ============================================================
    if (interaction.isButton()) {
      const customId = interaction.customId

      // Botão "Criar Aposta" (embed fixa)
      if (customId === 'bet_criar_aposta') {
        const modal = new ModalBuilder()
          .setCustomId('modal_criar_aposta')
          .setTitle('Criar Nova Aposta')

        const descInput = new TextInputBuilder()
          .setCustomId('bet_descricao')
          .setLabel('Descrição da aposta')
          .setPlaceholder('Ex: Quem vai ganhar a corrida?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)

        const opcao1Input = new TextInputBuilder()
          .setCustomId('bet_opcao1')
          .setLabel('Opção 1')
          .setPlaceholder('Ex: Time A')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)

        const opcao2Input = new TextInputBuilder()
          .setCustomId('bet_opcao2')
          .setLabel('Opção 2')
          .setPlaceholder('Ex: Time B')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)

        const horarioInput = new TextInputBuilder()
          .setCustomId('bet_horario')
          .setLabel('Horário de encerramento (HH:MM)')
          .setPlaceholder('Ex: 20:30')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)

        const oddsInput = new TextInputBuilder()
          .setCustomId('bet_odds')
          .setLabel('Odds (Opção 1 / Opção 2)')
          .setPlaceholder('Ex: 1.5 / 2.0')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)

        modal.addComponents(
          new ActionRowBuilder().addComponents(descInput),
          new ActionRowBuilder().addComponents(opcao1Input),
          new ActionRowBuilder().addComponents(opcao2Input),
          new ActionRowBuilder().addComponents(horarioInput),
          new ActionRowBuilder().addComponents(oddsInput),
        )

        return interaction.showModal(modal)
      }

      // Botão de aposta (formato: aposta_escolha_1_xxx ou aposta_escolha_2_xxx ou legado aposta_escolha_NOME)
      if (customId.startsWith('aposta_escolha_')) {
        const messageId = interaction.message.id
        const betDB = await Bet.findOne({ where: { messageId } })
        if (!betDB) {
          return interaction.reply({
            content: 'Aposta não encontrada.',
            flags: MessageFlags.Ephemeral,
          })
        }
        if (betDB.encerrada) {
          return interaction.reply({
            content: 'A aposta já foi encerrada.',
            flags: MessageFlags.Ephemeral,
          })
        }

        // Determina a opção: novo formato (1/2) ou legado (nome direto)
        const parts = customId.replace('aposta_escolha_', '')
        let opcaoEscolhida
        if (parts.startsWith('1_')) {
          opcaoEscolhida = betDB.opcao1
        } else if (parts.startsWith('2_')) {
          opcaoEscolhida = betDB.opcao2
        } else {
          // Legado: nome da opção direto
          opcaoEscolhida = parts
        }

        // Abre modal p/ apostar
        const modal = new ModalBuilder()
          .setCustomId(`modal_apostar_${opcaoEscolhida}`)
          .setTitle(`Apostar em "${opcaoEscolhida.substring(0, 30)}"`)

        const input = new TextInputBuilder()
          .setCustomId('aposta_qtd_pontos')
          .setLabel('Quantidade de pontos')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)

        const row = new ActionRowBuilder().addComponents(input)
        modal.addComponents(row)

        await interaction.showModal(modal)
        return
      }

      // Botão "Finalizar Aposta"
      if (customId.startsWith('aposta_finalizar')) {
        // Só administradores podem finalizar
        if (
          !interaction.member.permissions.has(
            PermissionsBitField.Flags.Administrator,
          )
        ) {
          return interaction.reply({
            content: 'Você não tem permissão para usar este comando.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const messageId = interaction.message.id
        const betDB = await Bet.findOne({ where: { messageId } })
        if (!betDB) {
          return interaction.reply({
            content: 'Aposta não existe no BD.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const modalFinal = new ModalBuilder()
          .setCustomId('modal_finalizar')
          .setTitle('Qual opção venceu?')

        const inp = new TextInputBuilder()
          .setCustomId('opcao_vencedora')
          .setLabel('Digite EXATAMENTE o nome da opção vencedora')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)

        const rowF = new ActionRowBuilder().addComponents(inp)
        modalFinal.addComponents(rowF)

        await interaction.showModal(modalFinal)
        return
      }
    }

    // ============================================================
    // 3) SUBMISSÃO DE MODAL
    // ============================================================
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId

      // (A) Modal CRIAR APOSTA (do botão da embed fixa)
      if (customId === 'modal_criar_aposta') {
        try {
          const descricao = interaction.fields.getTextInputValue('bet_descricao')
          const opcao1 = interaction.fields.getTextInputValue('bet_opcao1')
          const opcao2 = interaction.fields.getTextInputValue('bet_opcao2')
          const horarioStr = interaction.fields.getTextInputValue('bet_horario').trim()
          const oddsStr = interaction.fields.getTextInputValue('bet_odds').trim()

          // Parse odds (formato: "1.5 / 2.0" ou "1.5/2.0")
          const oddsParts = oddsStr.split('/').map(s => parseFloat(s.trim()))
          if (oddsParts.length !== 2 || isNaN(oddsParts[0]) || isNaN(oddsParts[1]) || oddsParts[0] <= 0 || oddsParts[1] <= 0) {
            return interaction.reply({
              content: '❌ Odds inválidas. Use o formato: `1.5 / 2.0`',
              flags: MessageFlags.Ephemeral,
            })
          }
          const odd1 = oddsParts[0]
          const odd2 = oddsParts[1]

          const agora = new Date()
          const [hh, mm] = horarioStr.split(':').map(Number)
          if (isNaN(hh) || isNaN(mm)) {
            return interaction.reply({
              content: '❌ Horário inválido. Use o formato HH:MM.',
              flags: MessageFlags.Ephemeral,
            })
          }
          const dataFechamento = new Date(agora)
          dataFechamento.setHours(hh, mm, 0, 0)

          if (dataFechamento <= agora) {
            return interaction.reply({
              content: '❌ O horário informado já passou. Aposta não foi criada.',
              flags: MessageFlags.Ephemeral,
            })
          }

          const betChannel = interaction.guild.channels.cache.get(config.channels.bet)
          if (!betChannel) {
            return interaction.reply({
              content: '❌ Canal de apostas não encontrado.',
              flags: MessageFlags.Ephemeral,
            })
          }

          const embedCriacao = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎲 Aposta: ${descricao}`)
            .setDescription(
              `**Criado por:** <@${interaction.user.id}>\n` +
              `**Encerramento automático**: \`${horarioStr}\`\n\n` +
              `Escolha abaixo **qual opção** você acha que vai vencer e aposte seus pontos!\n` +
              `Se acertar, você dividirá o montante dos perdedores de forma proporcional.\n\n` +
              `**Boa sorte!**`,
            )
            .addFields(
              {
                name: opcao1,
                value: `👥 Pessoas apostaram: \`0\` (0%)\n💰 Total apostado: \`0\`\n💸 Odd: \`${odd1.toFixed(2)}\``,
                inline: true,
              },
              {
                name: opcao2,
                value: `👥 Pessoas apostaram: \`0\` (0%)\n💰 Total apostado: \`0\`\n💸 Odd: \`${odd2.toFixed(2)}\``,
                inline: true,
              },
            )
            .setFooter({ text: `${config.branding.footerText} - Apostas` })
            .setTimestamp()

          const betId = Date.now().toString(36)
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`aposta_escolha_1_${betId}`)
              .setLabel(`Apostar em ${opcao1}`)
              .setEmoji('⚡')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`aposta_escolha_2_${betId}`)
              .setLabel(`Apostar em ${opcao2}`)
              .setEmoji('🔥')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`aposta_finalizar_${betId}`)
              .setLabel('Finalizar Aposta')
              .setEmoji('🔒')
              .setStyle(ButtonStyle.Danger),
          )

          const banner = attachImage(path.join(__dirname, '..', config.branding.bannerPath))
          embedCriacao.setImage(banner.url)

          const msgAposta = await betChannel.send({
            embeds: [embedCriacao],
            components: [row],
            files: [banner.attachment],
          })

          const novaBet = await Bet.create({
            guildId: interaction.guildId,
            channelId: betChannel.id,
            messageId: msgAposta.id,
            descricao,
            opcao1,
            opcao2,
            odd1,
            odd2,
            expiryTime: dataFechamento,
            encerrada: false,
          })

          const msAteFechar = dataFechamento.getTime() - Date.now()
          setTimeout(async () => {
            try {
              const betReload = await Bet.findOne({ where: { id: novaBet.id } })
              if (!betReload || betReload.encerrada) return
              await autoCloseBet(betReload, interaction.client)
            } catch (err) {
              console.error('Erro ao fechar aposta automaticamente:', err)
            }
          }, msAteFechar)

          return interaction.reply({
            content: `✅ Aposta **${descricao}** criada! Fechará às **${horarioStr}**.`,
            flags: MessageFlags.Ephemeral,
          })
        } catch (err) {
          console.error('Erro ao criar aposta:', err)
          if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({
              content: '❌ Erro ao criar aposta. Verifique o console.',
              flags: MessageFlags.Ephemeral,
            })
          }
        }
      }

      // (B) Modal de APOSTAR (escolher pontos)
      if (customId.startsWith('modal_apostar_')) {
        const opcaoEscolhida = customId.replace('modal_apostar_', '')
        const qtdStr = interaction.fields.getTextInputValue('aposta_qtd_pontos')
        const qtd = parseInt(qtdStr, 10) || 0
        if (qtd <= 0) {
          return interaction.reply({
            content: 'Quantidade de pontos inválida.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const messageId = interaction.message.id
        const betDB = await Bet.findOne({ where: { messageId } })
        if (!betDB) {
          return interaction.reply({
            content: 'Aposta não foi encontrada no BD.',
            flags: MessageFlags.Ephemeral,
          })
        }
        if (betDB.encerrada) {
          return interaction.reply({
            content: 'A aposta já foi encerrada.',
            flags: MessageFlags.Ephemeral,
          })
        }

        // Verifica pontos
        const userId = interaction.user.id
        let userP = await UserPontos.findOne({ where: { userId } })
        if (!userP) {
          userP = await UserPontos.create({ userId, pontos: 0 })
        }
        if (userP.pontos < qtd) {
          return interaction.reply({
            content: `Você não tem pontos suficientes (tem ${userP.pontos}).`,
            flags: MessageFlags.Ephemeral,
          })
        }

        // Desconta
        userP.pontos -= qtd
        await userP.save()

        // Registra no BD (UserActions) ou soma se já tinha aposta
        const idTipo = `BET_${betDB.id}_${opcaoEscolhida}`
        let action = await UserActions.findOne({
          where: { userId, id_tipo: idTipo },
        })
        let isNovaAposta = false
        if (!action) {
          action = await UserActions.create({
            userId,
            id_tipo: idTipo,
            nome_tipo: `Aposta na opção ${opcaoEscolhida}`,
            pontos: qtd,
            multiplicador: 0,
            pontosRecebidos: 0,
          })
          isNovaAposta = true
        } else {
          action.pontos += qtd
          await action.save()
        }

        // Atualiza embed (mostra total apostado, ROI, etc.)
        const msg2 = await interaction.channel.messages.fetch(messageId)
        const oldEmbed = msg2.embeds[0]
        if (!oldEmbed) {
          return interaction.reply({
            content: 'Embed da aposta não encontrado.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const { opcao1, opcao2 } = betDB
        const fields = [...oldEmbed.fields]
        const idxO1 = fields.findIndex(f => f.name === opcao1)
        const idxO2 = fields.findIndex(f => f.name === opcao2)
        if (idxO1 === -1 || idxO2 === -1) {
          return interaction.reply({
            content: 'Não encontrei as opções no embed.',
            flags: MessageFlags.Ephemeral,
          })
        }

        // Parser
        function parseField(valStr) {
          const matchPess = valStr.match(
            /Pessoas apostaram:\s?\`(\d+)\`.*\((\d+)%\)/,
          )
          const matchTotal = valStr.match(/Total apostado:\s?\`(\d+)\`/)
          return {
            pessoas: matchPess ? parseInt(matchPess[1]) : 0,
            pct: matchPess ? parseInt(matchPess[2]) : 0,
            total: matchTotal ? parseInt(matchTotal[1]) : 0,
          }
        }
        const o1Data = parseField(fields[idxO1].value)
        const o2Data = parseField(fields[idxO2].value)

        // Atualiza contagem
        if (opcaoEscolhida === opcao1) {
          if (isNovaAposta) o1Data.pessoas++
          o1Data.total += qtd
        } else {
          if (isNovaAposta) o2Data.pessoas++
          o2Data.total += qtd
        }

        // Odds fixas do BD
        const fixedOdd1 = betDB.odd1 || 1.0
        const fixedOdd2 = betDB.odd2 || 1.0

        // % de pessoas
        const totalP = o1Data.pessoas + o2Data.pessoas
        const pct1 =
          totalP === 0 ? 0 : Math.round((o1Data.pessoas / totalP) * 100)
        const pct2 =
          totalP === 0 ? 0 : Math.round((o2Data.pessoas / totalP) * 100)

        fields[idxO1].value =
          `👥 Pessoas apostaram: \`${o1Data.pessoas}\` (${pct1}%)\n` +
          `💰 Total apostado: \`${o1Data.total}\`\n` +
          `💸 Odd: \`${fixedOdd1.toFixed(2)}\``

        fields[idxO2].value =
          `👥 Pessoas apostaram: \`${o2Data.pessoas}\` (${pct2}%)\n` +
          `💰 Total apostado: \`${o2Data.total}\`\n` +
          `💸 Odd: \`${fixedOdd2.toFixed(2)}\``

        const embedAtualizado = EmbedBuilder.from(oldEmbed).setFields(fields)
        await msg2.edit({
          embeds: [embedAtualizado],
          components: msg2.components,
        })

        // ====== ADICIONADO: LOG NO CANAL 1350754120998453299 =======
        // try {
        //   const logChannel = interaction.guild.channels.cache.get('1350754120998453299');
        //   if (logChannel) {
        //     const logEmbed = new EmbedBuilder()
        //       .setAuthor({
        //         name: `${config.branding.name} - Aposta`,
        //         iconURL: interaction.user.displayAvatarURL(),
        //       })
        //       .setTitle('🎲 Nova Aposta')
        //       .setDescription(
        //         `O usuário <@${interaction.user.id}> apostou **${qtd}** pontos em **"${opcaoEscolhida}"**.`
        //       )
        //       .addFields(
        //         {
        //           name: 'Opção Apostada',
        //           value: `\`\`\`${opcaoEscolhida}\`\`\``,
        //           inline: true,
        //         },
        //         {
        //           name: 'Pontos Restantes',
        //           value: `\`\`\`${userP.pontos} pts\`\`\``,
        //           inline: true,
        //         }
        //       )
        //       .setColor('#00FF00')
        //       .setTimestamp()
        //       .setFooter({ text: `${config.branding.footerText} - Apostas` });

        //     await logChannel.send({ embeds: [logEmbed] });
        //   }
        // } catch (err) {
        //   console.error('Erro ao enviar log de aposta:', err);
        // }
        // ================================================

        const OTHER_GUILD_ID = config.guilds.logs
        const OTHER_LOG_CHANNEL_ID = config.logsChannels.loja

        try {
          // Obter a outra guild
          const otherGuild = interaction.client.guilds.cache.get(OTHER_GUILD_ID)
          if (otherGuild) {
            // Obter o canal de log na outra guild
            const logChannel =
              otherGuild.channels.cache.get(OTHER_LOG_CHANNEL_ID)
            if (logChannel) {
              const logEmbed = new EmbedBuilder()
                .setAuthor({
                  name: `${config.branding.name} - Aposta`,
                  iconURL: interaction.user.displayAvatarURL(),
                })
                .setTitle('🎲 Nova Aposta')
                .setDescription(
                  `O usuário <@${interaction.user.id}> apostou **${qtd}** pontos em **"${opcaoEscolhida}"**.`,
                )
                .addFields(
                  {
                    name: 'Opção Apostada',
                    value: `\`\`\`${opcaoEscolhida}\`\`\``,
                    inline: true,
                  },
                  {
                    name: 'Pontos Restantes',
                    value: `\`\`\`${userP.pontos} pts\`\`\``,
                    inline: true,
                  },
                )
                .setColor('#00FF00')
                .setTimestamp()
                .setFooter({ text: `${config.branding.footerText} - Apostas` })

              await logChannel.send({ embeds: [logEmbed] })
            } else {
              console.error('Canal não encontrado na outra guild.')
            }
          } else {
            console.error('Guild não encontrada.')
          }
        } catch (err) {
          console.error('Erro ao enviar log de aposta:', err)
        }

        return interaction.reply({
          content: `Aposta de **${qtd}** pontos em "${opcaoEscolhida}" registrada com sucesso!`,
          flags: MessageFlags.Ephemeral,
        })
      }

      // (B) Modal Finalizar
      if (customId === 'modal_finalizar') {
        const messageId = interaction.message.id
        const betDB = await Bet.findOne({ where: { messageId } })
        if (!betDB) {
          return interaction.reply({
            content: 'Aposta não encontrada no BD.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const opcaoVencedora = interaction.fields
          .getTextInputValue('opcao_vencedora')
          .trim()
        if (![betDB.opcao1, betDB.opcao2].includes(opcaoVencedora)) {
          return interaction.reply({
            content: `Opção inválida. Válidas: "${betDB.opcao1}" ou "${betDB.opcao2}".\nA aposta **não** foi finalizada. Tente novamente.`,
            flags: MessageFlags.Ephemeral,
          })
        }

        betDB.encerrada = true
        await betDB.save()

        const msg3 = await interaction.channel.messages.fetch(messageId)
        const oldEmbed = msg3.embeds[0]
        if (!oldEmbed) {
          return interaction.reply({
            content: 'Embed não encontrado.',
            flags: MessageFlags.Ephemeral,
          })
        }

        function parseField(valStr) {
          const matchPess = valStr.match(
            /Pessoas apostaram:\s?\`(\d+)\`.*\((\d+)%\)/,
          )
          const matchTotal = valStr.match(/Total apostado:\s?\`(\d+)\`/)
          const matchROI = valStr.match(/ROI \(Odds\):\s?\*(\d+(\.\d+)?)\*/)
          return {
            pessoas: matchPess ? parseInt(matchPess[1]) : 0,
            pct: matchPess ? parseInt(matchPess[2]) : 0,
            total: matchTotal ? parseInt(matchTotal[1]) : 0,
            roi: matchROI ? parseFloat(matchROI[1]) : 1.0,
          }
        }
        const fields = [...oldEmbed.fields]
        const idxO1 = fields.findIndex(f => f.name === betDB.opcao1)
        const idxO2 = fields.findIndex(f => f.name === betDB.opcao2)

        const o1Data = parseField(fields[idxO1].value)
        const o2Data = parseField(fields[idxO2].value)

        // Montante do perdedor
        const totalPerdedor =
          opcaoVencedora === betDB.opcao1 ? o2Data.total : o1Data.total

        // Apostas
        const idTipoO1 = `BET_${betDB.id}_${betDB.opcao1}`
        const idTipoO2 = `BET_${betDB.id}_${betDB.opcao2}`

        const [arrO1, arrO2] = await Promise.all([
          UserActions.findAll({ where: { id_tipo: idTipoO1 } }),
          UserActions.findAll({ where: { id_tipo: idTipoO2 } }),
        ])

        const mapO1 = {}
        for (const a of arrO1) {
          mapO1[a.userId] = (mapO1[a.userId] || 0) + a.pontos
        }
        const mapO2 = {}
        for (const a of arrO2) {
          mapO2[a.userId] = (mapO2[a.userId] || 0) + a.pontos
        }

        const mapVencedores = opcaoVencedora === betDB.opcao1 ? mapO1 : mapO2
        const mapPerdedores = opcaoVencedora === betDB.opcao1 ? mapO2 : mapO1
        const oddVencedora = opcaoVencedora === betDB.opcao1 ? (betDB.odd1 || 1.0) : (betDB.odd2 || 1.0)

        // Distribui com odds fixas: vencedor recebe aposta * odd
        for (const [uId, apostaUser] of Object.entries(mapVencedores)) {
          const totalReceber = Math.floor(apostaUser * oddVencedora)

          const userP = await UserPontos.findOne({ where: { userId: uId } })
          if (userP) {
            userP.pontos += totalReceber
            await userP.save()
          }
          const act = await UserActions.findOne({
            where: {
              userId: uId,
              id_tipo: `BET_${betDB.id}_${opcaoVencedora}`,
            },
          })
          if (act) {
            act.pontosRecebidos = totalReceber
            act.multiplicador = oddVencedora
            await act.save()
          }

          // DM vencedor
          try {
            const userObj = await interaction.client.users.fetch(uId)
            const embedDM = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle('Você venceu a aposta!')
              .setThumbnail(
                'https://media.discordapp.net/attachments/1344438558311841842/1350707246912372786/CAMPIN_BET_BRANCO.png?ex=67d7b7a6&is=67d66626&hm=e47b83b348dddfe44d730a7527ea1ee42571c1a7dd53c4ca977520a77a8356f3&=&format=webp&quality=lossless&width=1001&height=856',
              )
              .setDescription(
                `**Parabéns!**\n` +
                  `Você apostou \`${apostaUser}\` pontos em \`${opcaoVencedora}\` (odd ${oddVencedora.toFixed(2)}) e ganhou **${totalReceber}** pontos!\n` +
                  `*(Lucro: ${totalReceber - apostaUser} pontos)*`,
              )
              .setFooter({ text: 'Obrigado por participar!' })
              .setTimestamp()
            await userObj.send({ embeds: [embedDM] })
          } catch (err) {
            console.error(
              `Falha ao enviar DM (vencedor) para userId=${uId}:`,
              err,
            )
          }
        }

        // DM perdedor
        for (const [uId, apostaUser] of Object.entries(mapPerdedores)) {
          try {
            const userObj = await interaction.client.users.fetch(uId)
            const embedDMPerdeu = new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle('Você perdeu a aposta!')
              .setThumbnail(
                'https://media.discordapp.net/attachments/1344438558311841842/1350707246912372786/CAMPIN_BET_BRANCO.png?ex=67d7b7a6&is=67d66626&hm=e47b83b348dddfe44d730a7527ea1ee42571c1a7dd53c4ca977520a77a8356f3&=&format=webp&quality=lossless&width=1001&height=856',
              )
              .setDescription(
                `Você apostou \`${apostaUser}\` pontos em \`${opcaoVencedora === betDB.opcao1 ? betDB.opcao2 : betDB.opcao1}\`, mas essa opção perdeu!\n` +
                  `Você perdeu esses pontos. 😢`,
              )
              .setFooter({ text: 'Obrigado por participar!' })
              .setTimestamp()
            await userObj.send({ embeds: [embedDMPerdeu] })
          } catch (err) {
            console.error(
              `Falha ao enviar DM (perdedor) para userId=${uId}:`,
              err,
            )
          }
        }

        // Embed final
        const baseTitle = limparTituloBase(oldEmbed.title ?? '')
        const embedFinal = EmbedBuilder.from(oldEmbed)
          .setColor(0xff0000)
          .setTitle(`🏆 Aposta ENCERRADA: ${baseTitle}`)
          .setTimestamp()
          .setImage(oldEmbed.image?.url || null)
          .setDescription(
            `**Vencedor:** **${opcaoVencedora}**\n` +
              `A aposta foi finalizada, e os pontos foram distribuídos!\n` +
              `Parabéns aos ganhadores!`,
          )

        // Odds fixas do BD
        const finalOdd1 = (betDB.odd1 || 1.0).toFixed(2)
        const finalOdd2 = (betDB.odd2 || 1.0).toFixed(2)

        // Calcula novamente a % de pessoas
        const totalP = o1Data.pessoas + o2Data.pessoas
        const pctO1 =
          totalP === 0 ? 0 : Math.round((o1Data.pessoas / totalP) * 100)
        const pctO2 =
          totalP === 0 ? 0 : Math.round((o2Data.pessoas / totalP) * 100)

        // Reescreve fields
        embedFinal.spliceFields(
          0,
          2,
          {
            name: betDB.opcao1,
            value:
              `👥 Pessoas apostaram: \`${o1Data.pessoas}\` (${pctO1}%)\n` +
              `💰 Total apostado: \`${o1Data.total}\`\n` +
              `💸 Odd: \`${finalOdd1}\``,
            inline: true,
          },
          {
            name: betDB.opcao2,
            value:
              `👥 Pessoas apostaram: \`${o2Data.pessoas}\` (${pctO2}%)\n` +
              `💰 Total apostado: \`${o2Data.total}\`\n` +
              `💸 Odd: \`${finalOdd2}\``,
            inline: true,
          },
        )

        // Desabilita todos os botões
        const newComponents = []
        for (const row of msg3.components) {
          const newRow = new ActionRowBuilder()
          for (const comp of row.components) {
            if (comp.type === ComponentType.Button) {
              const btn = ButtonBuilder.from(comp).setDisabled(true)
              newRow.addComponents(btn)
            } else {
              newRow.addComponents(comp)
            }
          }
          newComponents.push(newRow)
        }

        await msg3.edit({
          embeds: [embedFinal],
          components: newComponents,
        })

        return interaction.reply({
          content: `Aposta finalizada! Vencedor: **${opcaoVencedora}**.`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}
