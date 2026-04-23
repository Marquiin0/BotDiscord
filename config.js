/**
 * Configuração centralizada do Bot Genesis Police
 * Todos os IDs de guilds, canais, categorias e cargos ficam aqui.
 */

module.exports = {
    // ==================== GUILDS ====================
    guilds: {
        main: '1477408727052193973',       // Genesis Police
        logs: '1477473906863505582',        // Servidor de logs
    },

    // ==================== CANAIS (Servidor Principal) ====================
    channels: {
        loja: '1477408729313054775',                // Loja do Kennedy
        cursoMAA: '1477408729509920853',             // Embed curso MAA
        acoes: '1477408729728155707',                // Embed relatório de ações
        acoesLog: '1477408729975754862',             // Log de ações completas
        apreensaoEmbed: '1481839118915731558',        // Embed botão apreensão
        apreensaoLog: '1478762123835346954',          // Log relatórios de apreensão
        prisaoEmbed: '1481839335870431252',           // Embed botão prisão
        prisaoLog: '1478762158027444285',             // Log relatórios de prisão
        ausencia: '1477408729728155703',             // Embed ausência
        ausenciaLog: '1477408729728155704',          // Log de ausências
        pedidos: '1477408729103335440',              // Pedidos (exoneração, aposentadoria, promoção)
        exoneracaoLog: '1477408729509920857',        // Log exonerações/punições
        painelInfo: '1477408729103335443',           // Painel principal (minhas informações)
        hierarquia: '1477408729103335437',           // Hierarquia
        setagem: '1477408728465801313',              // Embed setagem
        setagemAprovacao: '1477408728465801314',     // Aprovação de setagem
        tickets: '1477408728884969655',              // Embed tickets / recurso corregedoria
        promocaoLog: '1477408729103335438',          // Log promoções/rebaixamentos
        identificacaoLog: '1477408729103335444',     // Log identificação (fotos)
        cursoComprovantes: '1482106954640920636',  // Revisão comprovantes de curso
        cursoAprovados: '1482106851871948821',     // Lista de aprovados do curso
        ranking: '1477408729313054776',              // Ranking de pontos
        bet: '1481838121992720457',                  // Canal de apostas
    },

    // ==================== CANAIS (Servidor de Logs) ====================
    logsChannels: {
        apreensao: '1477473908260208808',    // Log apreensões (source)
        prisao: '1477473908260208809',       // Log prisões (source)
        identificacao: '1477473908402946122', // Log identificação
        ticket: '1477473908260208812',       // Log tickets (transcript)
        ponto: '1477473908260208804',        // Log ponto/horas (source toggle Genesis)
        pontoMerryWeather: '1493298297073569902', // Log ponto/horas (source toggle MerryWeather)
        horasPTR: '1477473908402946121',     // Log embed de horas PTR (entrada/saída)
        loja: '1477473908402946125',         // Log compras da loja
        rebaixamento: '1477473908402946129', // Log rebaixamentos
        promocao: '1477473908402946129',    // Log promoções
        corregedoria: '1477473908587233434', // Log advertências/exonerações
        setUnidades: '1477473908826443830',  // Log de set de unidades (batalhões)
    },

    // ==================== CATEGORIAS ====================
    categories: {
        acoes: '1477408729728155705',        // Categoria relatórios de ações + setagem
        cursoQuiz: '1477408729509920851',    // Categoria para quizzes do curso MAA
        tickets: '1477408728884969654',      // Categoria para tickets
    },

    // ==================== CARGOS DE PATENTE (ordem: CMD -> EST) ====================
    ranks: {
        CMD:    { roleId: '1477408727295463437', tag: '[CMD]',   name: 'Comandante' },
        SCMD:   { roleId: '1477408727295463436', tag: '[SCMD]',  name: 'Subcomandante' },
        HC:     { roleId: '1477408727295463435', tag: '[H.C]',   name: 'Alto Comando' },
        IC:     { roleId: '1477408727270166606', tag: '[I.C]',   name: 'Controle Interno' },
        AE:     { roleId: '1477408727270166608', tag: '[A.E]',   name: 'Alto Escalão' },
        COR:    { roleId: '1477408727244996735', tag: '[COR]',   name: 'Coronel' },
        TCOR:   { roleId: '1477408727244996734', tag: '[T-COR]', name: 'Tenente Coronel' },
        MAJ:    { roleId: '1477408727244996733', tag: '[MAJ]',   name: 'Major' },
        CAP:    { roleId: '1477408727244996732', tag: '[CAP]',   name: 'Capitão' },
        '1TEN': { roleId: '1477408727244996731', tag: '[1TEN]',  name: '1º Tenente' },
        '2TEN': { roleId: '1477408727244996730', tag: '[2TEN]',  name: '2º Tenente' },
        ASP:    { roleId: '1477408727244996729', tag: '[ASP]',   name: 'Aspirante' },
        STEN:   { roleId: '1477408727244996728', tag: '[S-TEN]', name: 'Subtenente' },
        '1SGT': { roleId: '1477408727236874249', tag: '[1SGT]',  name: '1º Sargento' },
        '2SGT': { roleId: '1477408727236874248', tag: '[2SGT]',  name: '2º Sargento' },
        '3SGT': { roleId: '1477408727236874247', tag: '[3SGT]',  name: '3º Sargento' },
        CB:     { roleId: '1477408727236874246', tag: '[CB]',    name: 'Cabo' },
        SD:     { roleId: '1477408727236874245', tag: '[SD]',    name: 'Soldado' },
        EST:    { roleId: '1477408727236874244', tag: '[EST]',   name: 'Estagiário' },
    },

    // Array ordenado de patentes (maior -> menor) para promoção/rebaixamento
    rankOrder: [
        'CMD', 'SCMD', 'HC', 'AE', 'IC', 'COR', 'TCOR', 'MAJ', 'CAP',
        '1TEN', '2TEN', 'ASP', 'STEN', '1SGT', '2SGT', '3SGT', 'CB', 'SD', 'EST'
    ],

    // Mapa roleId -> tag (para lookup rápido)
    get promotionTags() {
        const tags = {};
        for (const key of this.rankOrder) {
            const rank = this.ranks[key];
            tags[rank.roleId] = rank.tag;
        }
        return tags;
    },

    // Mapa roleId -> próximo roleId (promoção)
    get promotionMap() {
        const map = {};
        for (let i = this.rankOrder.length - 1; i > 0; i--) {
            const currentRank = this.ranks[this.rankOrder[i]];
            const nextRank = this.ranks[this.rankOrder[i - 1]];
            map[currentRank.roleId] = nextRank.roleId;
        }
        return map;
    },

    // Mapa roleId -> roleId anterior (rebaixamento)
    get demotionMap() {
        const map = {};
        for (let i = 0; i < this.rankOrder.length - 1; i++) {
            const currentRank = this.ranks[this.rankOrder[i]];
            const prevRank = this.ranks[this.rankOrder[i + 1]];
            map[currentRank.roleId] = prevRank.roleId;
        }
        return map;
    },

    // ==================== CARGOS FUNCIONAIS ====================
    roles: {
        identificado: '1477408727052193977',
        naoIdentificado: '1477408727052193976',
        ausencia: '1477408727270166600',
        aposentado: '1477408727236874241',
        maaAprovado: '1477408727119298809',
        adv1: '1477408727165308974',        // Advertência 1 (15 dias)
        adv2: '1477408727165308973',        // Advertência 2 (7 dias)
        rh: '1477408727270166607',            // Recursos Humanos (cargo funcional)
        recruta: '1477408727052193974',     // Cargo recruta (setagem)
        membro: '1477408727236874244',      // Cargo membro base (= EST)
    },

    // ==================== MEDALHAS ====================
    medals: {
        medal1: '1477408727215898737',
        medal2: '1477408727215898736',
        medal3: '1477408727215898735',
        medal4: '1477408727203053718',
    },

    // ==================== PERMISSÕES (quem pode usar corregedoria etc) ====================
    permissions: {
        corregedoria: [
            '1477408727270166606',  // I.C
            '1477408727295463435',  // H.C
            '1477408727295463436',  // SCMD
            '1477408727295463437',  // CMD
        ],
        cancelarRelatorio: [
            '1477408727270166606',  // I.C
            '1477408727270166607',  // Staff (mencionado no texto)
            '1477408727295463435',  // H.C
            '1477408727295463436',  // SCMD
            '1477408727295463437',  // CMD
        ],
        staff: '1477408727270166607',  // Cargo staff geral
        curso: [
            '1477408727165308968',  // Instrutor 1
            '1482112997634605106',  // Instrutor 2
            '1477408727165308969',  // Instrutor 3
        ],
    },

    // ==================== TICKET TYPES ====================
    ticketTypes: {
        command: {
            name: 'Comando',
            customId: 'ticket_command',
            categoryId: '1477408728884969654',
            staffRoles: ['1477408727295463437'],  // CMD
        },
        duvidas: {
            name: 'Dúvidas',
            customId: 'ticket_duvidas',
            categoryId: '1477408728884969654',
            staffRoles: ['1477408727270166607'],  // Staff
        },
        corregedoria: {
            name: 'Corregedoria',
            customId: 'ticket_corregedoria',
            categoryId: '1477408728884969654',
            staffRoles: ['1477408727270166606'],  // I.C
        },
    },

    // ==================== SISTEMA DE PONTOS ====================
    points: {
        apreensao: 5,
        identificacao: 100,
        prisao: 30,
        acaoComandadaVitoria: 50,
        acaoComandadaDerrota: 10,
        acaoParticipadaVitoria: 30,
        acaoParticipadaDerrota: 5,
        horaPTR: 10,
        ticketFinalizado: 50,
        recerberAdv: -30,
        participantePrisao: 5,
    },

    // ==================== CURSO MAA ====================
    cursoMAA: {
        channelId: '1477408729509920853',
        categoryId: '1477408729509920851',
        roleAprovado: '1477408727119298809',
        siteUrl: 'https://www.canva.com/design/DAHDejNVO_U/EaLh113GjBVF9rW41sEW0Q/edit',
        totalPerguntas: 28,
        acertosNecessarios: 22,
        tempoLimiteMs: 30 * 60 * 1000,  // 30 minutos
    },

    // ==================== BRANDING ====================
    branding: {
        name: 'Genesis Police',
        shortName: 'Genesis Police',
        hierarchyTitle: 'HIERARQUIA GENESIS POLICE',
        color: '#1E90FF',
        footerText: 'Genesis Police',
        bannerUrl: 'https://cdn.discordapp.com/attachments/1477408728679714896/1481818996398620844/banner.png?ex=69b4b2fb&is=69b3617b&hm=dd813801249ac5e36b073e4a52e7154c30c543b92aabab9d4b2aba113b6a3ab3&',
    },

    // ==================== OWNER ====================
    ownerId: '233987539264995328',

    // ==================== BATALHÕES ====================
    battalions: [
        {
            guildId: '1481606531160997953',
            channelId: '1481606532184670261',
            approvalChannelId: '1481718192782184658',
            roleIds: ['1481718994229661868', '1481722975559356446'],
            roleName: 'S.W.A.T',
            mainRoleId: '1481720985743921455',
            imagePath: './assets/swat.png',
        },
        {
            guildId: '1483574861866602756',
            channelId: '1483574862747275406',
            approvalChannelId: '1483574862747275408',
            roleIds: ['1483574861866602757', '1483574861866602762'],
            roleName: 'S.O.G',
            mainRoleId: '1477408727253647556',
            imagePath: './assets/sog.png',
        },
        {
            guildId: '1483575520577720502',
            channelId: '1483575521009991818',
            approvalChannelId: '1483575521009991820',
            roleIds: ['1483575520577720508', '1483575520577720509'],
            roleName: 'S.T.E',
            mainRoleId: '1477408727253647555',
            imagePath: './assets/ste.png',
            visitorRoleId: '1483575520577720506',
            nickTag: '[STE-R]',
        },
        {
            guildId: '1474523272732344390',
            channelId: '1474523278373556256',
            approvalChannelId: '1483599311068463205',
            roleIds: ['1474523272732344397', '1477521710218477588'],
            roleName: 'MerryWeather',
            mainRoleId: '1477408727253647557',
            imagePath: './assets/merryweather_banner.gif',
            thumbnailPath: './assets/merryweather_thumbnail.webp',
            fotoPath: './assets/merryweather_foto.png',
        },
    ],
};
