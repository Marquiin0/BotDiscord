const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js')
const { MessageFlags } = require('discord.js')
const config = require('../config')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupprova')
    .setDescription(
      'Configura o sistema de prova, enviando a mensagem com o botão.',
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

    try {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('startprova')
          .setLabel('Registrar')
          .setEmoji('🪪')
          .setStyle(ButtonStyle.Danger),
      )

      const channel = interaction.guild.channels.cache.get(
        config.channels.setagem,
      )
      if (!channel) {
        return interaction.reply({
          content: 'Canal não encontrado!',
          flags: MessageFlags.Ephemeral,
        })
      }
      const infoEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`Instruções sobre a ${config.branding.name}`)
        .setAuthor({
          name: config.branding.footerText,
        })
        .setDescription(
          '**Bem-vindo!**\n' +
            'Leia atentamente algumas regras e instruções:\n\n' +
            '1. **Estagiários:** Não podem PTR sozinhos, só usam viaturas livres e têm 5 dias + 10 relatórios (mín. 7H de patrulha).\n' +
            '2. **Conduta:** Respeite a hierarquia, siga o manual e mantenha ética. Insubordinação pode resultar em advertência ou exoneração.\n' +
            '3. **Viaturas:** Não use viaturas de outras polícias. Mantenha o padrão e não as abandone.\n' +
            '4. **PTR:** Mínimo de 7H semanais. Menos que 7H = ADV 1, menos que 3H = ADV 2, menos de 1H = exoneração.\n' +
            '5. **Finalização de Ações:** É obrigatório finalizar ações de rua e apreender itens.\n' +
            '6. **Identificação:** Identifique-se quando solicitado. Proibido entrar em áreas restritas sem autorização.\n' +
            '7. **Abuso de Sistema:** Proibido toggles para vantagens. Sujeito a exoneração.\n' +
            '8. **Ausência:** Máximo de 15 dias. Quatro dias sem serviço e sem justificativa = exoneração.\n' +
            '9. **Vazamento:** Qualquer vazamento, até de chats, resulta em exoneração.\n' +
            '10. **Aposentadoria:** Apenas 3ºSGT+. Se reingressar, volta com uma patente abaixo.\n',
        )
        .setTimestamp()
        .setFooter({
          text: 'Clique no botão abaixo para iniciar seu registro',
        })

      // Enviar o embed da próxima pergunta com os botões
      await channel.send({ embeds: [infoEmbed] })
      await channel.send({
        content: '',
        components: [row],
      })

      await interaction.reply({
        content: 'Mensagem enviada com sucesso!',
        flags: MessageFlags.Ephemeral,
      })
    } catch (error) {
      console.error(error)
      await interaction.reply({
        content: 'Ocorreu um erro ao enviar a mensagem!',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
