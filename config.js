/**
 * Configuração centralizada do Bot MerryWeather
 * Todos os IDs de guilds, canais, categorias e cargos ficam aqui.
 */

module.exports = {
    // ==================== GUILDS ====================
    guilds: {
        main: '1474523272732344390',       // MerryWeather (servidor principal)
        logs: '1477473906863505582',        // Servidor de logs (externo, mantido)
        unidades: {
            sog: '1483574861866602756',    // SOG
            swat: '1481606531160997953',   // SWAT
            ste: '1483575520577720502',    // STE
        },
    },

    // ==================== CANAIS (Servidor MerryWeather) ====================
    // Canais ativos da MerryWeather + canais legados (Genesis Police) que ficam
    // dormentes — comandos antigos referenciam mas não disparam mais por padrão.
    channels: {
        // === MerryWeather (ativos) ===
        hierarquia: '1498073429935657161',           // Embed editável de hierarquia
        tickets: '1474527177994273029',              // Embed tickets / recurso corregedoria
        ausencia: '1474523282698145825',             // Canal "Solicitar Ausência"
        ausenciaLog: '1498132392416903198',          // Embeds de ausência aprovadas
        exoneracaoLog: '1474523283935203429',        // Embeds /corregedoria

        // === Legados Genesis Police (comandos antigos dormentes) ===
        loja: '1477408729313054775',
        cursoMAA: '1477408729509920853',
        acoes: '1477408729728155707',
        acoesLog: '1477408729975754862',
        apreensaoEmbed: '1481839118915731558',
        apreensaoLog: '1478762123835346954',
        prisaoEmbed: '1481839335870431252',
        prisaoLog: '1478762158027444285',
        pedidos: '1477408729103335440',
        painelInfo: '1477408729103335443',
        setagem: '1477408728465801313',
        setagemAprovacao: '1477408728465801314',
        promocaoLog: '1477408729103335438',
        relatorioPatrulha: '1477408728679714896',
        identificacaoLog: '1477408729103335444',
        identificacaoResumo: '1477408728679714904',
        cursoComprovantes: '1482106954640920636',
        cursoAprovados: '1482106851871948821',
        ranking: '1477408729313054776',
        bet: '1481838121992720457',
        arsenalAlerta: '1477408728679714903',
        saidaAlerta: '1477408728679714904',
        requisitos: '1494363413873299746',
        blackUnidades: '1494770890058109030',
    },

    // ==================== CANAIS (Servidor de Logs) ====================
    logsChannels: {
        apreensao: '1477473908260208808',    // Log apreensões (source)
        prisao: '1477473908260208809',       // Log prisões (source)
        identificacao: '1477473908402946122', // Log identificação (aceita/negada)
        ticket: '1477473908260208812',       // Log tickets (transcript + open/assume/close)
        ponto: '1477473908260208804',        // Log ponto/horas (source toggle Genesis)
        pontoMerryWeather: '1493298297073569902', // Log ponto/horas (source toggle MerryWeather)
        horasPTR: '1477473908402946121',     // Log horas PTR (entrada/saída toggle)
        loja: '1477473908402946125',         // Log compras da loja
        rebaixamento: '1477473908402946129', // Log rebaixamentos
        promocao: '1477473908402946129',    // Log promoções
        corregedoria: '1477473908587233434', // Log advertências/exonerações
        cursoMAA: '1481839491030454424',       // Log resultados curso MAA
        ausencia: '1477473908402946126',     // Log ausências
        aposentadoria: '1477473908402946123', // Log oficiais aposentados
        pontos: '1477473908402946120',       // Log adição de pontos (/pontos)
        envioPontos: '1477473908402946124',  // Log envio/transferência de pontos
        registro: '1477473907563823116',     // Registro FTO (embed botão)
        aceitarRegistro: '1477473907563823117', // Aceitar/recusar registros
        ticketsLogs: '1477473907563823118',  // Tickets do server de logs
        setUnidades: '1477473908826443830',  // Log de set de unidades
        acao: '1477473908260208810',         // Log ações (source FiveM)
        rec: '1477473907912212503',          // Canal de registro de REC (FTO)
    },

    // ==================== CATEGORIAS ====================
    categories: {
        acoes: '1477408729728155705',        // Categoria relatórios de ações + setagem
        cursoQuiz: '1477408729509920851',    // Categoria para quizzes do curso MAA
        tickets: '1477408728884969654',      // Categoria para tickets
        ticketsLogs: '1494500619334193212', // Categoria para tickets do server de logs / canais privados REC
        recPrivado: '1494500619334193212',  // Alias para ticketsLogs (canais /registrar-rec)
    },

    // ==================== CARGOS DO SERVER DE LOGS (FTO) ====================
    ftoRoles: {
        policial: '1494513575627329718',   // Cargo policial (todos recebem ao aceitar)
        swat: '1477473906863505586',       // Cargo SWAT
        ste: '1477473906863505584',        // Cargo STE
        sog: '1477473906863505585',        // Cargo SOG
    },

    // ==================== CARGOS DE PATENTE (ordem: CMD -> SHADOW) ====================
    ranks: {
        CMD:      { roleId: '1474523273231601687', tag: '[CMD]',      name: 'Commander' },
        SCMD:     { roleId: '1474523273231601685', tag: '[SCMD]',     name: 'Sub Commander' },
        COR:      { roleId: '1498127409327898664', tag: '[COR]',      name: 'Corregedor' },
        OPERATOR: { roleId: '1477522110082449600', tag: '[OPERATOR]', name: 'Operator' },
        EXECUTOR: { roleId: '1477521656296771687', tag: '[EXECUTOR]', name: 'Executor' },
        SHADOW:   { roleId: '1477521710218477588', tag: '[SHADOW]',   name: 'Shadow' },
    },

    // Array ordenado de patentes (maior -> menor) para promoção/rebaixamento
    rankOrder: [
        'CMD', 'SCMD', 'COR', 'OPERATOR', 'EXECUTOR', 'SHADOW'
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
        // === MerryWeather (ativos) ===
        membro: '1474523272732344397',           // Cargo MerryWeather (todos recebem ao serem setados)
        commander: '1474523273231601687',        // CMD
        subCommander: '1474523273231601685',     // SCMD
        corregedor: '1498127409327898664',       // COR
        operator: '1477522110082449600',         // OPERATOR
        executor: '1477521656296771687',         // EXECUTOR
        shadow: '1477521710218477588',           // SHADOW (estagiário, cargo inicial)
        recruta: '1477521710218477588',          // alias para SHADOW (compatibilidade)
        ausencia: '1474523272937869383',         // Cargo de ausência
        advVerbal: '1474523272937869375',        // ADV Verbal (5 dias)
        adv1: '1474523272732344399',             // ADV 1 (10 dias)
        adv2: '1474523272732344398',             // ADV 2 (15 dias)

        // === Legados Genesis (mantidos para comandos antigos não quebrarem) ===
        identificado: '1477408727052193977',
        naoIdentificado: '1477408727052193976',
        aposentado: '1477408727236874241',
        maaAprovado: '1477408727119298809',
        rh: '1477408727270166607',
        blacklistUnidade: '1477408727052193979',
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
        rec: ['1496999612127514644', '1496999134551605399'], // Cargos autorizados /registrar-rec (FTO — legado)
        // MerryWeather: Corregedor + Sub Commander + Commander
        corregedoria: [
            '1498127409327898664',  // Corregedor
            '1474523273231601685',  // Sub Commander
            '1474523273231601687',  // Commander
        ],
        // MerryWeather: SCMD + CMD (promover/rebaixar/setar-cargo)
        staffMerry: [
            '1474523273231601685',  // Sub Commander
            '1474523273231601687',  // Commander
        ],
        cancelarRelatorio: [
            '1498127409327898664',  // Corregedor
            '1474523273231601685',  // Sub Commander
            '1474523273231601687',  // Commander
        ],
        staff: '1477408727270166607',  // Cargo staff legado (Genesis)

        // === Permissões legadas (Genesis) abaixo — mantidas com IDs antigos para que
        //     comandos antigos não crashem no boot. Como esses cargos não existem na
        //     guild MerryWeather, os comandos automaticamente recusam o acesso e
        //     ficam dormentes até serem reconfigurados. ===
        curso: [
            '1477408727165308968',  // Instrutor 1
            '1482112997634605106',  // Instrutor 2
            '1477408727165308969',  // Instrutor 3
        ],
        maaExempt: [
            '1477408727270166606',  // I.A
            '1477408727270166608',  // S.C
            '1477408727295463435',  // H.C
            '1477408727295463436',  // SCMD
            '1477408727295463437',  // CMD
        ],
        // RH+ = R.H, I.A, S.C, H.C, SCMD, CMD (para comandos administrativos)
        rhPlus: [
            '1477408727270166607',  // R.H
            '1477408727270166606',  // I.A
            '1477408727270166608',  // S.C
            '1477408727295463435',  // H.C
            '1477408727295463436',  // SCMD
            '1477408727295463437',  // CMD
        ],
        // HC+ = H.C, SCMD, CMD (para comandos de alto nível)
        hcPlus: [
            '1477408727295463435',  // H.C
            '1477408727295463436',  // SCMD
            '1477408727295463437',  // CMD
        ],
        // FTO e RECS (para tickets de recrutamento)
        ftoRecs: [
            '1482113888332939455',  // FTO/REC 1
            '1482114057061404692',  // FTO/REC 2
            '1482114148128260156',  // FTO/REC 3
            '1482113980414693409',  // FTO/REC 4
        ],
        // I.A+ = I.A, S.C, H.C, SCMD, CMD
        iaPlus: [
            '1477408727270166606',  // I.A
            '1477408727270166608',  // S.C
            '1477408727295463435',  // H.C
            '1477408727295463436',  // SCMD
            '1477408727295463437',  // CMD
        ],
        // Comandos de unidade (podem usar /black)
        unitCommands: [
            '1477408727253647561',  // SOG Command
            '1477408727253647560',  // STE Command
            '1477408727253647559',  // SWAT Command
        ],
        // Limite de promoção/rebaixamento por cargo
        // CMD e SCMD não tem limite (admin)
        promotionLimits: {
            '1477408727270166607': 'MAJ',   // R.H pode promover até Major
            '1477408727270166606': 'MAJ',   // I.A pode promover até Major
            '1477408727270166608': 'COR',   // S.C pode promover até Coronel
            '1477408727295463435': 'COR',   // H.C pode promover até Coronel
        },
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
        acertosNecessarios: 25,
        tempoLimiteMs: 30 * 60 * 1000,  // 30 minutos
    },

    // ==================== CURSOS DE AÇÃO (role IDs) ====================
    actionCourseRoles: [
        '1494359171422752860', // HyperMercado
        '1494359165391601704', // Teatro
        '1494359121057681489', // Lojinha
        '1494359127508389888', // Ammunation
        '1494359132935946321', // Yellowjack
        '1494359145338376293', // Mcdonalds
        '1494359139512750170', // Comedy
        '1494357815882551316', // AeroPorto Abandonado
        '1494357833536376922', // Joalheria
        '1494359151596408923', // Barbearia
        '1494357827945238629', // Porto
        '1494359159666114620', // Bebidas
        '1494357821955772567', // Trevos
        '1494357810434015434', // Açougue
        '1494357783628353606', // Fleeca
        '1494357793594146970', // Clube Praia
        '1494356761921196234', // Porta Aviões
        '1494356778685562890', // Banco Paleto
        '1494357799843401960', // Cinema
        '1494357805459705926', // Observatorio
        '1494356769172885595', // Niobio
        '1494356569780125806', // Banco Central
        '1494356754555994333', // Galinheiro
    ],

    // ==================== REDUÇÃO DE DIAS (itens da loja) ====================
    promotionDayReductions: {
        '1477408727215898737': 3,   // -3 dias promoção
        '1477408727215898736': 5,   // -5 dias promoção
        '1477408727215898735': 10,  // -10 dias promoção
        '1477408727203053718': 15,  // -15 dias promoção (Premium)
    },

    // ==================== REQUISITOS DE PROMOÇÃO ====================
    promotionRequirements: {
        EST:    { nextRank: 'SD',   label: 'EST → SD',     cursoMAA: true,  apreensaoAcao: 10,  prisao: 5,  horasPatrulha: 0,  cursosAcao: 0,  semAdvertencia: false, dias: 5 },
        SD:     { nextRank: 'CB',   label: 'SD → CB',      cursoMAA: false, apreensaoAcao: 15,  prisao: 8,  horasPatrulha: 10, cursosAcao: 0,  semAdvertencia: false, dias: 7 },
        CB:     { nextRank: '3SGT', label: 'CB → 3SGT',    cursoMAA: false, apreensaoAcao: 20,  prisao: 12, horasPatrulha: 15, cursosAcao: 2,  semAdvertencia: false, dias: 10 },
        '3SGT': { nextRank: '2SGT', label: '3SGT → 2SGT',  cursoMAA: false, apreensaoAcao: 30,  prisao: 18, horasPatrulha: 25, cursosAcao: 4,  semAdvertencia: true,  dias: 14 },
        '2SGT': { nextRank: '1SGT', label: '2SGT → 1SGT',  cursoMAA: false, apreensaoAcao: 40,  prisao: 22, horasPatrulha: 35, cursosAcao: 6,  semAdvertencia: true,  dias: 16 },
        '1SGT': { nextRank: 'STEN', label: '1SGT → S-TEN', cursoMAA: false, apreensaoAcao: 50,  prisao: 28, horasPatrulha: 45, cursosAcao: 8,  semAdvertencia: true,  dias: 18 },
        STEN:   { nextRank: 'ASP',  label: 'S-TEN → ASP',  cursoMAA: false, apreensaoAcao: 60,  prisao: 32, horasPatrulha: 50, cursosAcao: 10, semAdvertencia: true,  dias: 25 },
        ASP:    { nextRank: '2TEN', label: 'ASP → 2TEN',   cursoMAA: false, apreensaoAcao: 70,  prisao: 38, horasPatrulha: 60, cursosAcao: 13, semAdvertencia: true,  dias: 30 },
        '2TEN': { nextRank: '1TEN', label: '2TEN → 1TEN',  cursoMAA: false, apreensaoAcao: 80,  prisao: 42, horasPatrulha: 70, cursosAcao: 16, semAdvertencia: true,  dias: 35 },
        '1TEN': { nextRank: 'CAP',  label: '1TEN → CAP',   cursoMAA: false, apreensaoAcao: 90,  prisao: 48, horasPatrulha: 80, cursosAcao: 19, semAdvertencia: true,  dias: 40 },
        CAP:    { nextRank: 'MAJ',  label: 'CAP → MAJ',    cursoMAA: false, apreensaoAcao: 100, prisao: 55, horasPatrulha: 90, cursosAcao: 23, semAdvertencia: true,  dias: 45 },
        MAJ:    { nextRank: 'TCOR', label: 'MAJ → T-COR',  indicacao: true, dias: 30 },
        TCOR:   { nextRank: 'COR',  label: 'T-COR → COR',  indicacao: true, dias: 30 },
    },

    // ==================== ITEM MISTERIOSO ====================
    itemMisterioso: {
        authorizedUsers: [
            '670897303787405325',
            '334697727659081728',
            '870741609828991007',
            '1075964560542015548',
        ],
        purchaseRoleId: '1482541452671058022',
        resultados: [
            { emoji: '🎭', nome: '/PD de Personagem', roleId: '1481867956899025099', peso: 10 },
            { emoji: '⬆️', nome: 'Up de Patente', roleId: '1481867012882956381', peso: 10 },
            { emoji: '⬇️', nome: 'Rebaixamento', roleId: '1481867809301594296', peso: 10 },
            { emoji: '⚠️', nome: 'Advertência', roleId: '1481867457231847436', peso: 10 },
            { emoji: '👟', nome: 'Descalço (1 semana)', roleId: '1481867863932276857', peso: 10 },
            { emoji: '🏷️', nome: 'Criar Cargo', roleId: '1481868045495566366', peso: 10 },
            { emoji: '⭐', nome: 'Prioridade em Ações (1 dia)', roleId: '1481868123488522260', peso: 10 },
            { emoji: '💀', nome: 'Nada aconteceu, Loser!', roleId: '1482604127531044965', peso: 20 },
            { emoji: '📉', nome: 'Rebaixamento Temporário', roleId: '1482600443694547018', peso: 15 },
            { emoji: '🏷️', nome: 'Obrigado a usar apelido 24h', roleId: '1482600459569991763', peso: 13 },
            { emoji: '🚫', nome: 'Proibido PTR 1 hora', roleId: '1482600476372500550', peso: 10 },
            { emoji: '💸', nome: 'Multa interna de pontos', roleId: '1482600490016702596', peso: 20 },
            { emoji: '🔍', nome: 'Investigação interna', roleId: '1482600507662143614', peso: 8 },
            { emoji: '📝', nome: 'Aplicar apelido 24h', roleId: '1482600525202591817', peso: 12 },
            { emoji: '✏️', nome: 'Escolha de Apelido 24h', roleId: '1482600553560408076', peso: 15 },
            { emoji: '📊', nome: '-50% na próxima rodada', roleId: '1482600960491520010', peso: 20 },
            { emoji: '🛡️', nome: 'Ignorar 1 obrigação interna', roleId: '1482600977843355750', peso: 5 },
            { emoji: '🚗', nome: 'Escolha de VTR 1x', roleId: '1482601000899707002', peso: 20 },
            { emoji: '🚙', nome: 'VTR exclusiva 3 dias', roleId: '1482601017966067722', peso: 10 },
            { emoji: '👔', nome: 'Farda exclusiva 1 semana', roleId: '1482601041508831242', peso: 3 },
        ],
    },

    // ==================== BRANDING ====================
    branding: {
        name: 'MerryWeather',
        shortName: 'MerryWeather',
        hierarchyTitle: 'HIERARQUIA MERRYWEATHER',
        color: '#8B0000',
        footerText: 'MerryWeather • Sevis Pacem Parabellum',
        bannerPath: './assets/merryweather/banner.png',
        bannerGifPath: './assets/merryweather/banner.gif',
        logoPath: './assets/merryweather/logo.png',
        perfilPath: './assets/merryweather/perfil.gif',
    },

    // ==================== ARSENAL (itens proibidos por patente) ====================
    arsenalProibido: {
        '1TEN': ['silvertape', 'weapon_flare', 'weapon_militaryrifle'],
        ASP:    ['silvertape', 'weapon_flare', 'weapon_militaryrifle'],
        STEN:   ['silvertape', 'weapon_flare', 'weapon_militaryrifle'],
        '1SGT': ['silvertape', 'weapon_pumpshotgun_mk2', 'weapon_flare', 'weapon_militaryrifle'],
        '2SGT': ['silvertape', 'weapon_pumpshotgun_mk2', 'weapon_flare', 'weapon_militaryrifle'],
        '3SGT': ['silvertape', 'weapon_smg_mk2', 'weapon_pumpshotgun_mk2', 'weapon_flare', 'weapon_militaryrifle'],
        CB:     ['silvertape', 'weapon_revolver_mk2', 'weapon_smg_mk2', 'weapon_pumpshotgun_mk2', 'weapon_flare', 'weapon_militaryrifle'],
        SD:     ['silvertape', 'weapon_pistol50', 'weapon_revolver_mk2', 'weapon_smg_mk2', 'weapon_pumpshotgun_mk2', 'weapon_flare', 'weapon_militaryrifle'],
        EST:    ['silvertape', 'weapon_specialcarbine_mk2', 'weapon_pistol50', 'weapon_revolver_mk2', 'weapon_smg_mk2', 'weapon_pumpshotgun_mk2', 'weapon_flare', 'weapon_militaryrifle'],
    },

    // ==================== OWNER ====================
    ownerId: '233987539264995328',

    // ==================== BATALHÕES ====================
    // Servidores externos de batalhão com sincronização ao servidor principal
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
        // (MerryWeather removida desta lista — agora é o servidor principal, configurado em guilds.main)
    ],
};
