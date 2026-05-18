export interface BrazilState {
  uf: string;
  name: string;
  cities: string[];
}

export const BRAZIL_STATES: BrazilState[] = [
  {
    uf: 'AC', name: 'Acre',
    cities: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá', 'Feijó', 'Brasileia', 'Epitaciolândia', 'Juruá', 'Mâncio Lima', 'Rodrigues Alves'],
  },
  {
    uf: 'AL', name: 'Alagoas',
    cities: ['Maceió', 'Arapiraca', 'Palmeira dos Índios', 'Rio Largo', 'Penedo', 'União dos Palmares', 'São Miguel dos Campos', 'Delmiro Gouveia', 'Coruripe', 'Santana do Ipanema'],
  },
  {
    uf: 'AM', name: 'Amazonas',
    cities: ['Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru', 'Coari', 'Tefé', 'Tabatinga', 'Maués', 'Humaitá', 'São Gabriel da Cachoeira'],
  },
  {
    uf: 'AP', name: 'Amapá',
    cities: ['Macapá', 'Santana', 'Laranjal do Jari', 'Oiapoque', 'Mazagão', 'Porto Grande', 'Tartarugalzinho', 'Pedra Branca do Amapari'],
  },
  {
    uf: 'BA', name: 'Bahia',
    cities: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Juazeiro', 'Ilhéus', 'Itabuna', 'Lauro de Freitas', 'Jequié', 'Barreiras', 'Paulo Afonso', 'Alagoinhas', 'Porto Seguro', 'Simões Filho', 'Luís Eduardo Magalhães', 'Santo Antônio de Jesus', 'Teixeira de Freitas', 'Senhor do Bonfim', 'Ibotirama', 'Guanambi'],
  },
  {
    uf: 'CE', name: 'Ceará',
    cities: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú', 'Sobral', 'Crato', 'Itapipoca', 'Maranguape', 'Iguatu', 'Quixadá', 'Canindé', 'Aquiraz', 'Russas', 'Tianguá', 'Pacatuba'],
  },
  {
    uf: 'DF', name: 'Distrito Federal',
    cities: ['Brasília', 'Ceilândia', 'Taguatinga', 'Samambaia', 'Planaltina', 'Gama', 'Guará', 'Sobradinho', 'Recanto das Emas', 'Santa Maria'],
  },
  {
    uf: 'ES', name: 'Espírito Santo',
    cities: ['Vitória', 'Serra', 'Vila Velha', 'Cariacica', 'Cachoeiro de Itapemirim', 'Linhares', 'São Mateus', 'Colatina', 'Guarapari', 'Aracruz', 'Viana', 'Nova Venécia', 'Barra de São Francisco', 'Santa Maria de Jetibá'],
  },
  {
    uf: 'GO', name: 'Goiás',
    cities: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde', 'Luziânia', 'Águas Lindas de Goiás', 'Valparaíso de Goiás', 'Trindade', 'Formosa', 'Novo Gama', 'Jataí', 'Catalão', 'Itumbiara', 'Senador Canedo', 'Caldas Novas', 'Goianésia', 'Mineiros', 'Inhumas', 'Morrinhos', 'Ceres', 'Uruaçu', 'Niquelândia', 'Cristalina', 'Quirinópolis', 'Goiatuba'],
  },
  {
    uf: 'MA', name: 'Maranhão',
    cities: ['São Luís', 'Imperatriz', 'Timon', 'Caxias', 'Codó', 'Paço do Lumiar', 'Açailândia', 'Bacabal', 'Balsas', 'Santa Inês', 'Pinheiro', 'Presidente Dutra', 'São José de Ribamar'],
  },
  {
    uf: 'MG', name: 'Minas Gerais',
    cities: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim', 'Montes Claros', 'Ribeirão das Neves', 'Uberaba', 'Governador Valadares', 'Ipatinga', 'Sete Lagoas', 'Divinópolis', 'Santa Luzia', 'Ibirité', 'Poços de Caldas', 'Patos de Minas', 'Pouso Alegre', 'Teófilo Otoni', 'Barbacena', 'Sabará', 'Varginha', 'Itajubá', 'Araguari', 'Ituiutaba', 'Pirapora', 'Lavras', 'Formiga', 'Conselheiro Lafaiete', 'Coronel Fabriciano', 'Muriaé'],
  },
  {
    uf: 'MS', name: 'Mato Grosso do Sul',
    cities: ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã', 'Naviraí', 'Nova Andradina', 'Aquidauana', 'Sidrolândia', 'Paranaíba', 'Coxim', 'Maracaju', 'São Gabriel do Oeste', 'Chapadão do Sul', 'Amambai', 'Cassilândia', 'Rio Brilhante', 'Jardim', 'Bonito'],
  },
  {
    uf: 'MT', name: 'Mato Grosso',
    cities: ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra', 'Cáceres', 'Sorriso', 'Lucas do Rio Verde', 'Primavera do Leste', 'Barra do Garças', 'Alta Floresta', 'Nova Mutum', 'Campo Verde', 'Guarantã do Norte', 'Juara', 'Colíder', 'Pontes e Lacerda', 'Juína', 'Nova Xavantina', 'Diamantino'],
  },
  {
    uf: 'PA', name: 'Pará',
    cities: ['Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Castanhal', 'Parauapebas', 'Cameta', 'Abaetetuba', 'Bragança', 'Altamira', 'Tucuruí', 'Itaituba', 'Redenção', 'Tailândia', 'Paragominas'],
  },
  {
    uf: 'PB', name: 'Paraíba',
    cities: ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux', 'Sousa', 'Cajazeiras', 'Cabedelo', 'Guarabira', 'Sapé'],
  },
  {
    uf: 'PE', name: 'Pernambuco',
    cities: ['Recife', 'Caruaru', 'Olinda', 'Jaboatão dos Guararapes', 'Petrolina', 'Paulista', 'Camaragibe', 'Garanhuns', 'Vitória de Santo Antão', 'Cabo de Santo Agostinho', 'Abreu e Lima', 'Bezerros', 'Santa Cruz do Capibaribe', 'Carpina', 'Araripina'],
  },
  {
    uf: 'PI', name: 'Piauí',
    cities: ['Teresina', 'Parnaíba', 'Picos', 'Piripiri', 'Floriano', 'Campo Maior', 'Barras', 'Canto do Buriti', 'Oeiras', 'Pedro II'],
  },
  {
    uf: 'PR', name: 'Paraná',
    cities: ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel', 'São José dos Pinhais', 'Foz do Iguaçu', 'Colombo', 'Guarapuava', 'Paranaguá', 'Araucária', 'Toledo', 'Apucarana', 'Pinhais', 'Campo Largo', 'Almirante Tamandaré', 'Umuarama', 'Francisco Beltrão', 'Paranavaí', 'Campo Mourão', 'Sarandi', 'Cambé', 'Cianorte', 'Telêmaco Borba', 'Pato Branco'],
  },
  {
    uf: 'RJ', name: 'Rio de Janeiro',
    cities: ['Rio de Janeiro', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu', 'Niterói', 'Belford Roxo', 'São João de Meriti', 'Campos dos Goytacazes', 'Petrópolis', 'Volta Redonda', 'Magé', 'Macaé', 'Itaboraí', 'Maricá', 'Nilópolis', 'Resende', 'Angra dos Reis', 'Nova Friburgo', 'Barra Mansa', 'Queimados'],
  },
  {
    uf: 'RN', name: 'Rio Grande do Norte',
    cities: ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante', 'Ceará-Mirim', 'Caicó', 'Assu', 'Currais Novos', 'Santa Cruz', 'Nova Cruz'],
  },
  {
    uf: 'RO', name: 'Rondônia',
    cities: ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena', 'Cacoal', 'Rolim de Moura', 'Guajará-Mirim', 'Jaru', 'Ouro Preto do Oeste', 'Pimenta Bueno'],
  },
  {
    uf: 'RR', name: 'Roraima',
    cities: ['Boa Vista', 'Rorainópolis', 'Caracaraí', 'Alto Alegre', 'Mucajaí', 'Amajari', 'Bonfim'],
  },
  {
    uf: 'RS', name: 'Rio Grande do Sul',
    cities: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas', 'Santa Maria', 'Gravataí', 'Viamão', 'Novo Hamburgo', 'São Leopoldo', 'Rio Grande', 'Alvorada', 'Passo Fundo', 'Sapucaia do Sul', 'Uruguaiana', 'Santa Cruz do Sul', 'Cachoeirinha', 'Bagé', 'Bento Gonçalves', 'Erechim', 'Guaíba', 'Cruz Alta', 'Santana do Livramento', 'Ijuí', 'Lajeado', 'São Borja'],
  },
  {
    uf: 'SC', name: 'Santa Catarina',
    cities: ['Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Chapecó', 'Criciúma', 'Itajaí', 'Jaraguá do Sul', 'Palhoça', 'Balneário Camboriú', 'Brusque', 'Tubarão', 'São Bento do Sul', 'Caçador', 'Lages', 'Concórdia', 'Camboriú', 'Navegantes', 'Rio do Sul', 'Araranguá'],
  },
  {
    uf: 'SE', name: 'Sergipe',
    cities: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana', 'São Cristóvão', 'Estância', 'Tobias Barreto', 'Simão Dias', 'Propriá', 'Nossa Senhora das Dores'],
  },
  {
    uf: 'SP', name: 'São Paulo',
    cities: ['São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André', 'Osasco', 'Ribeirão Preto', 'Sorocaba', 'Mauá', 'São José dos Campos', 'Mogi das Cruzes', 'Diadema', 'Jundiaí', 'Carapicuíba', 'Piracicaba', 'Bauru', 'Itaquaquecetuba', 'São José do Rio Preto', 'Santos', 'Suzano', 'Guarujá', 'Limeira', 'Franca', 'Taubaté', 'Praia Grande', 'São Vicente', 'Araçatuba', 'Presidente Prudente', 'Marília', 'Cotia', 'Mogi Guaçu', 'Araraquara', 'Barueri', 'Americana', 'Itapecerica da Serra', 'Indaiatuba', 'Botucatu', 'Taboão da Serra', 'Jacareí', 'Rio Claro'],
  },
  {
    uf: 'TO', name: 'Tocantins',
    cities: ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional', 'Paraíso do Tocantins', 'Araguatins', 'Colinas do Tocantins', 'Guaraí', 'Tocantinópolis', 'Miracema do Tocantins'],
  },
];

export const STATE_OPTIONS = BRAZIL_STATES.map((s) => ({
  value: s.uf,
  label: `${s.uf} — ${s.name}`,
}));

export function getCitiesByState(uf: string): string[] {
  return BRAZIL_STATES.find((s) => s.uf === uf)?.cities ?? [];
}
