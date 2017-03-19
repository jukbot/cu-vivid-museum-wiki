const _ = require('lodash');
const { Resolver } = require('graphql-compose');

const { scientificSplit } = require('../common');
const { GraphQLEnumType, GraphQLList, GraphQLUnionType, GraphQLObjectType } = require('graphql');

module.exports = ({ PlantTC, GardenTC, MuseumTC, HerbariumTC }) => {
  const CategoryEnum = new GraphQLEnumType({
    name: 'CategoryEnum',
    values: require('../../category'),
  });

  const PlantSearchResultItemType = new GraphQLList(new GraphQLUnionType({
    name: 'PlantSearchResultItem',
    types: [HerbariumTC.getType(), GardenTC.getType(), MuseumTC.getType()],
    resolveType(value) {
      switch (value.category) {
        case 'garden':
          return GardenTC.getType();
        case 'herbarium':
          return HerbariumTC.getType();
        case 'museum':
          return MuseumTC.getType();
        default:
          return HerbariumTC.getType();
      }
    },
  }));

  PlantTC.setResolver('search', new Resolver({
    name: 'search',
    type: new GraphQLObjectType({
      name: 'PlantSearchResult',
      fields: {
        result: { type: PlantSearchResultItemType },
        count: { type: 'Int' },
      },
    }),
    args: {
      text: { type: '[String]', defaultValue: [] },
      categories: { type: new GraphQLList(CategoryEnum), defaultValue: ['garden', 'herbarium', 'museum'] },
      skip: { type: 'Int', defaultValue: 0 },
      limit: { type: 'Int', defaultValue: 20 },
    },
    resolve: async ({
      args: { categories, text, skip, limit },
      context: { Garden, Museum, Herbarium, Plant },
    }) => {
      console.time('Find plant by category and scientific name');
      const test = new RegExp(text.join('|'), 'i');
      let result = [];

      const q = categories.map(async (category) => {
        let model;
        switch (category) {
          case 'garden':
            model = Garden;
            break;
          case 'herbarium':
            model = Herbarium;
            break;
          case 'museum':
            model = Museum;
            break;
          default:
            model = Herbarium;
            break;
        }


        const categorySeachResult = await model.aggregate([
          { $lookup: { from: 'plants', localField: 'plantId', foreignField: '_id', as: 'plant' } },
          { $unwind: '$plant' },
          { $match: { $or: [{ 'plant.scientificName': test }, { 'plant.familyName': test }, { 'plant.name': test }] } },
        ]);
        result = [].concat.apply([], [categorySeachResult, result]);
      });
      await Promise.all(q);
      console.timeEnd('Find plant by category and scientific name');
      return {
        result: _(result)
          .sortBy(item => item.scientificName)
          .slice(skip, skip + limit),
        count: result.length,
      };
    },
  }));


  const PlantIdRelationArg = {
    filter: source => ({ plantId: source._id.toString() }),
  };

  PlantTC.addRelation('Museum', () => ({
    resolver: MuseumTC.getResolver('findMany'),
    args: PlantIdRelationArg,
    projection: { _id: 1, plantId: 1 },
  }));
  PlantTC.addRelation('Garden', () => ({
    resolver: GardenTC.getResolver('findMany'),
    args: PlantIdRelationArg,
    projection: { _id: 1, plantId: 1 },
  }));
  PlantTC.addRelation('Herbarium', () => ({
    resolver: HerbariumTC.getResolver('findMany'),
    args: PlantIdRelationArg,
    projection: { _id: 1, plantId: 1 },
  }));


  PlantTC.extendField('scientificName', {
    description: '',
    resolve: source => (scientificSplit(source.scientificName)),
  });
};
