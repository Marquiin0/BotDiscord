const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false,
        },
    },
    logging: false,
});



const Ausencia = sequelize.define('Ausencia', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    userName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    startDate: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    endDate: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    motivo: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'Motivo automático',
    },
    messageId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    channelId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Ativa',
    }
});

const Timer = sequelize.define('Timer', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    endAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
});




const Warning = sequelize.define('Warning', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    roleId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    appliedBy: {  
        type: DataTypes.STRING,
        allowNull: false,
    }
});


const MemberID = sequelize.define('MemberID', {
    memberName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    discordId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
    },
});
const WeeklyPoints = sequelize.define('WeeklyPoints', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    userName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    weeklyPoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
}, {
    timestamps: true, // Para criar as colunas createdAt e updatedAt
});

const PatrolHours = sequelize.define('PatrolHours', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    hours: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    lastEntry: { type: DataTypes.DATE, allowNull: true } // Novo campo para armazenar a última entrada

});

const PatrolSession = sequelize.define('PatrolSession', {
    inGameId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    discordId: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    memberName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    entryTime: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    exitTime: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    duration: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'genesis',
    },
    weekStart: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    nextCheckAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
    },
});

const UserLog = sequelize.define('UserLog', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    userName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    item: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
});

const WeaponLog = sequelize.define('WeaponLog', {
    userId: DataTypes.STRING,
    userName: DataTypes.STRING,
    item: DataTypes.STRING,
    date: DataTypes.DATE,
    quantity: DataTypes.INTEGER,
});

const UserPoints = sequelize.define('UserPoints', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    userName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    totalPoints: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});

const ActionReports = sequelize.define('ActionReports', {
    actionName: { type: DataTypes.STRING, allowNull: false },
    actionTime: { type: DataTypes.STRING, allowNull: false },
    commanderId: { type: DataTypes.STRING, allowNull: false },
    commanderName: { type: DataTypes.STRING, allowNull: false },
    messageId: { type: DataTypes.STRING, allowNull: false },
    participants: { type: DataTypes.TEXT, allowNull: true }, // Armazena os participantes como string separada por vírgulas
    opponent: { type: DataTypes.STRING, allowNull: false }, // Contra quem foi a ação
    result: { type: DataTypes.STRING, allowNull: true } // "Vitória" ou "Derrota"
});

const ActionReportsAll = sequelize.define('ActionReportsAll', {
    actionName: { type: DataTypes.STRING, allowNull: false },
    actionTime: { type: DataTypes.STRING, allowNull: false },
    commanderId: { type: DataTypes.STRING, allowNull: false },
    commanderName: { type: DataTypes.STRING, allowNull: false },
    messageId: { type: DataTypes.STRING, allowNull: false },
    participants: { type: DataTypes.TEXT, allowNull: true }, // Armazena os participantes como string separada por vírgulas
    opponent: { type: DataTypes.STRING, allowNull: false }, // Contra quem foi a ação
    result: { type: DataTypes.STRING, allowNull: true } // "Vitória" ou "Derrota"
});


const PrisonReports = sequelize.define('PrisonReports', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    commanderId: { type: DataTypes.STRING, allowNull: false }, // ID do usuário que prendeu
    commanderName: { type: DataTypes.STRING, allowNull: false }, // Nome do usuário que prendeu
    suspectId: { type: DataTypes.STRING, allowNull: false }, // ID do suspeito
    suspectName: { type: DataTypes.STRING, allowNull: false }, // Nome do suspeito
    articles: { type: DataTypes.TEXT, allowNull: false }, // Artigos violados
    participants: { type: DataTypes.TEXT, allowNull: true }, // IDs dos participantes (salvos como string separada por vírgula)
    imageUrl: { type: DataTypes.TEXT, allowNull: true }, // IDs dos participantes (salvos como string separada por vírgula)
    reportDate: { type: DataTypes.STRING, allowNull: false }, // Data da prisão
    messageId: {
        type: DataTypes.STRING,
        allowNull: true, // Permite ser nulo até que seja atualizado
      }
});


const PromotionRecords = sequelize.define('PromotionRecords', {
    userId: { type: DataTypes.STRING, allowNull: false, primaryKey: true }, // ID do Discord do usuário
    userName: { type: DataTypes.STRING, allowNull: false }, // Nome no Discord
    lastPromotionDate: { type: DataTypes.DATE, allowNull: true } // Última data de promoção
});

const PromotionRequests = sequelize.define('PromotionRequests', {
    userId: { type: DataTypes.STRING, allowNull: false, primaryKey: true },
    messageId: { type: DataTypes.STRING, allowNull: false }
});

const ApreensaoReports = sequelize.define('ApreensaoReports', {
    commanderId: { type: DataTypes.STRING, allowNull: false },
    commanderName: { type: DataTypes.STRING, allowNull: false },
    imageUrl: { type: DataTypes.STRING, allowNull: true },
    participants: { type: DataTypes.TEXT, allowNull: false },    // URL da imagem da apreensão
    reportDate: { type: DataTypes.DATE, allowNull: false },
    messageId: {
        type: DataTypes.STRING,
        allowNull: true, // Permite ser nulo até que seja atualizado
      }
});

const Aposentadoria = sequelize.define('Aposentadoria', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    userName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    requestDate: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    motivo: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Pendente',
    },
    messageId: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    channelId: {
        type: DataTypes.STRING,
        allowNull: true,
    }
});
const Ticket = sequelize.define('Ticket', {
    ticketIdentifier: {
      type: DataTypes.STRING,
      unique: true,
    },
    userIdOpened: DataTypes.STRING,
    userIdAssumed: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userIdResolved: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dateResolved: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
        type: DataTypes.STRING, // "aberto" ou "resolvido"
        defaultValue: 'aberto', // padrão "aberto"
      },
  });

  const Inscricao = sequelize.define('Inscricao', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.STRING, // ou DataTypes.BIGINT, dependendo do ID
        allowNull: false,
    },
    courseId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'PENDENTE', 
        // Pode ser 'PENDENTE', 'APROVADO', 'RECUSADO', etc.
    },
    comprovanteUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, {
    tableName: 'inscricoes',
});


const Course = sequelize.define('Course', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  courseId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  data: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  horario: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  vagas: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
local: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  messageId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  channelId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  
}, {
  tableName: 'courses',
});
// Modelo para Pontos Totais do Usuário (somente pontos)
const UserPontos = sequelize.define('UserPontos', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true, // Garante apenas um registro por usuário
    },
    pontos: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    }
}, {
    tableName: 'userpontos',
    timestamps: true,
});

// Modelo para registrar cada ação realizada pelo usuário (auditoria)
const UserActions = sequelize.define('UserActions', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    id_tipo: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    nome_tipo: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    pontos: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Aqui registramos qual multiplicador foi aplicado naquele momento
    multiplicador: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    pontosRecebidos: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    tableName: 'useractions',
    timestamps: true,
});

// Novo modelo para armazenar os multiplicadores dos usuários
const UserMultiplicadores = sequelize.define('UserMultiplicadores', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true, // Cada usuário terá um registro único
    },
    // O campo "multiplicador" poderá ser, por exemplo, 2, 3, 4, 5; se não houver registro, o valor padrão será 1 (não aplicado)
    multiplicador: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
}, {
    tableName: 'usermultiplicadores',
    timestamps: true,
});

const DonationRecords = sequelize.define('DonationRecords', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    tipo: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    salario: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    pontos: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    expiracao: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    }
}, {
    tableName: 'donationrecords',
    timestamps: false,
});
const Loja = sequelize.define('Loja', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    item: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    valor: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    cargo: {
        type: DataTypes.STRING,
        allowNull: true, // Permite nulo para itens que não envolvem cargos
    },
    dataCompra: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    dataExpiracao: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'Loja',
});

const Bet = sequelize.define('Bet', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    guildId: DataTypes.STRING,
    channelId: DataTypes.STRING,
    messageId: DataTypes.STRING,
    descricao: DataTypes.STRING,
    opcao1: DataTypes.STRING,
    opcao2: DataTypes.STRING,
    odd1: {
      type: DataTypes.FLOAT,
      defaultValue: 1.0,
    },
    odd2: {
      type: DataTypes.FLOAT,
      defaultValue: 1.0,
    },
    expiryTime: DataTypes.DATE, // quando encerra automaticamente
    encerrada: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: 'bets',
    timestamps: true,
  });


  const Sorteio = sequelize.define('Sorteio', {
    raffleId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    expiration: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    winnersCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    points: { // Adicionado o campo points
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    messageId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    channelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isDrawn: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    }
  }, {
    tableName: 'sorteio',
    timestamps: true,
  });
  
  const RoleLimit = sequelize.define('RoleLimit', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    roleId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    limit: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    timestamps: true,
});

const RemovedRole = sequelize.define('RemovedRole', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    roleId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    expiration: {
        type: DataTypes.DATE,
        allowNull: false,
    }
}, {
    timestamps: true,
});

const Identificacao = sequelize.define('Identificacao', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fotoUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dataRegistro: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    // A dataExpiracao será calculada como "data de registro + 7 dias"
    dataExpiracao: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'ativo',
        allowNull: false
      },
       messageId: {
              type: DataTypes.STRING,
              allowNull: true,
            },
  }, {
    timestamps: true,
  });


const QuizResult = sequelize.define('QuizResult', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    score: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    totalQuestions: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 28,
    },
    passed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
    },
    attemptDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'quizresults',
    timestamps: true,
});

const SetagemConfig = sequelize.define('SetagemConfig', {
    key: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
    },
    value: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
}, {
    tableName: 'setagemconfig',
    timestamps: true,
});

const VictoryDefeat = sequelize.define('VictoryDefeat', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    commanderId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    commanderName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    actionName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'victorydefeat',
    timestamps: true,
});

const ArsenalProcessedLog = sequelize.define('ArsenalProcessedLog', {
    messageId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
    },
}, {
    tableName: 'arsenal_processed_logs',
    timestamps: true,
});

const ArsenalIsento = sequelize.define('ArsenalIsento', {
    userId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
    },
    addedBy: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    tableName: 'arsenal_isentos',
    timestamps: true,
});

ArsenalProcessedLog.sync();
ArsenalIsento.sync();
QuizResult.sync();
SetagemConfig.sync();
VictoryDefeat.sync();
Identificacao.sync();
RemovedRole.sync();
RoleLimit.sync();
Sorteio.sync()
Bet.sync()
Loja.sync();
DonationRecords.sync();
UserMultiplicadores.sync();
UserActions.sync();
UserPontos.sync();
Course.sync();
Inscricao.sync();
Ticket.sync();
ApreensaoReports.sync(); // Garante que a tabela será criada
Aposentadoria.sync(); // Garante que a tabela será criada
PromotionRecords.sync(); // Garante que a tabela seja criada no banco de dados
PromotionRequests.sync();
PrisonReports.sync();
ActionReports.sync();
ActionReportsAll.sync();
UserLog.sync();
MemberID.sync();
sequelize.sync({ alter: true });
PatrolHours.sync();
WeaponLog.sync();
UserPoints.sync()
WeeklyPoints.sync()
Ausencia.sync()
PatrolSession.sync()

module.exports = {
    UserPoints,
    UserLog,
    Timer,
    Warning,
    MemberID,
    PatrolHours,
    WeaponLog,
    WeeklyPoints,
    Ausencia,
    ActionReports,
    ActionReportsAll,
    PrisonReports,
    PromotionRecords,
    PromotionRequests,
    Aposentadoria,
    ApreensaoReports,
    Ticket,
    Inscricao,
    Course,
    UserPontos,
    UserActions,
    UserMultiplicadores,
    DonationRecords,
    Loja,
    Bet,
    Sorteio,
    RoleLimit,
    RemovedRole,
    Identificacao,
    QuizResult,
    SetagemConfig,
    VictoryDefeat,
    ArsenalProcessedLog,
    ArsenalIsento,
    PatrolSession,
};





