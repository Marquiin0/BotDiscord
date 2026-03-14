const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
} = require('discord.js')
const {
  ActionReports,
  PrisonReports,
  ApreensaoReports,
} = require('../database')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relatorio-add')
    .setDescription('Cria registros de relatórios com dados fictícios.')
    .addUserOption(option =>
      option
        .setName('pessoa')
        .setDescription('Pessoa para quem o relatório será criado')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('tipo')
        .setDescription('Tipo de relatório')
        .setRequired(true)
        .addChoices(
          { name: 'Apreensao', value: 'apreensao' },
          { name: 'Prisao', value: 'prisao' },
          { name: 'Acao', value: 'acao' },
        ),
    )
    .addIntegerOption(option =>
      option
        .setName('quantidade')
        .setDescription('Quantidade de registros a criar')
        .setRequired(true),
    ),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      ) &&
      !interaction.memberPermissions.has(
        PermissionsBitField.Flags.UseApplicationCommands,
      )
    ) {
      return interaction.reply({
        content: '❌ Você não tem permissão.',
        flags: MessageFlags.Ephemeral,
      })
    }

    // Obtém os parâmetros
    const pessoa = interaction.options.getUser('pessoa')
    const tipo = interaction.options.getString('tipo').toLowerCase()
    const quantidade = interaction.options.getInteger('quantidade')

    // Variável para armazenar o modelo a ser utilizado e os contadores
    let model
    let oldCount, newCount

    try {
      // Seleciona o modelo com base no tipo
      if (tipo === 'apreensao') {
        model = ApreensaoReports
      } else if (tipo === 'prisao') {
        model = PrisonReports
      } else if (tipo === 'acao') {
        model = ActionReports
      } else {
        return interaction.reply({
          content: 'Tipo de relatório inválido.',
          flags: MessageFlags.Ephemeral,
        })
      }

      // Conta quantos registros a pessoa já possui antes da criação
      oldCount = await model.count({ where: { commanderId: pessoa.id } })

      // Cria a quantidade de registros solicitada
      for (let i = 0; i < quantidade; i++) {
        if (tipo === 'apreensao') {
          await ApreensaoReports.create({
            commanderId: pessoa.id,
            commanderName: pessoa.username,
            imageUrl: 'https://dummyimage.com/600x400',
            participants: 'dummy1,dummy2',
            reportDate: new Date(),
            messageId: interaction.id,
          })
        } else if (tipo === 'prisao') {
          await PrisonReports.create({
            commanderId: pessoa.id,
            commanderName: pessoa.username,
            suspectId: 'dummySuspectId',
            suspectName: 'Dummy Suspect',
            articles: 'Artigo 1, Artigo 2',
            participants: 'dummy1,dummy2',
            imageUrl: 'https://dummyimage.com/600x400',
            reportDate: new Date().toISOString(),
            messageId: interaction.id,
          })
        } else if (tipo === 'acao') {
          await ActionReports.create({
            actionName: 'Ação Fictícia',
            actionTime: new Date().toISOString(),
            commanderId: pessoa.id,
            commanderName: pessoa.username,
            messageId: interaction.id,
            participants: 'dummy1,dummy2',
            opponent: 'Dummy Oponente',
            result: 'Dummy Resultado',
          })
        }
      }

      // Conta quantos registros a pessoa possui após a criação
      newCount = await model.count({ where: { commanderId: pessoa.id } })

      // Envia log no servidor de logs
      const otherGuild = interaction.client.guilds.cache.get(config.guilds.logs)
      if (otherGuild) {
        // Busca o canal de log na outra guild
        const logChannel = otherGuild.channels.cache.get(config.logsChannels.ponto)
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setAuthor({
              name: `${config.branding.footerText} - Relatórios`,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setTitle('📄 Novo Relatório Adicionado')
            .setDescription(
              `O usuário <@${interaction.user.id}> adicionou **${quantidade}** registros de tipo **${tipo}** para <@${pessoa.id}>.`,
            )
            .addFields(
              { name: 'Antes', value: `\`\`\`${oldCount}\`\`\``, inline: true },
              { name: 'Agora', value: `\`\`\`${newCount}\`\`\``, inline: true },
            )
            .setColor('#00FF00')
            .setTimestamp()
            .setFooter({ text: `${config.branding.footerText} - Relatórios` })

          await logChannel.send({ embeds: [logEmbed] })
        } else {
          console.error('Canal de log não encontrado na outra guild.')
        }
      } else {
        console.error('Outra guild não encontrada.')
      }

      return interaction.reply({
        content: `Foram criados ${quantidade} registros de ${tipo} para <@${pessoa.id}>.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (error) {
      console.error('Erro ao criar registros:', error)
      return interaction.reply({
        content: 'Houve um erro ao criar os registros.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
