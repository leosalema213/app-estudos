export const numberOptions = [
  ['Limites diários', [['newPerDay', 'Novas por dia', 1], ['reviewsPerDay', 'Revisões por dia', 1]]],
  ['Novas cartas e lapsos', [['graduating', 'Intervalo ao graduar (dias)', 1], ['easyInterval', 'Intervalo Fácil (dias)', 1], ['minInterval', 'Intervalo mínimo após lapso (dias)', 1], ['leechThreshold', 'Limite de lapsos (carta problemática)', 1]]],
  ['Temporizadores', [['maxAnswerSeconds', 'Limite registrado por resposta (s)', 1], ['questionSeconds', 'Avanço da pergunta (s; 0 desativa)', 0.1], ['answerSeconds', 'Avanço da resposta (s; 0 desativa)', 0.1]]],
  ['Agendamento', [['maxInterval', 'Intervalo máximo (dias)', 1], ['initialEase', 'Facilidade inicial', 0.01], ['easyBonus', 'Bônus Fácil', 0.01], ['hardInterval', 'Multiplicador Difícil', 0.01], ['intervalModifier', 'Modificador do intervalo', 0.01], ['newInterval', 'Fração do intervalo após lapso', 0.01], ['retention', 'Retenção desejada FSRS (0–1)', 0.01]]],
];
