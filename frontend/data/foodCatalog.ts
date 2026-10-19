// Sample generic foods (typical values per 100 g / 100 ml). Bundled sample data only.

import type { Food } from '../domain/types';

type F = [string, string, 'g' | 'ml', number, number, number, number, number | null, number | null, number | null, number | null, [number, string] | null, string | null];
// [id, name, unit, kcal, protein, carbs, fat, sugars, saturates, fibre, salt, serving, barcode]
const rows: F[] = [
  ['oats', 'Rolled oats', 'g', 379, 13.2, 67.7, 6.5, 1.0, 1.1, 10.1, 0.01, [40, '1 bowl (40 g)'], '5000000000011'],
  ['banana', 'Banana', 'g', 89, 1.1, 22.8, 0.3, 12.2, 0.1, 2.6, 0, [118, '1 medium'], null],
  ['chicken', 'Chicken breast, cooked', 'g', 165, 31, 0, 3.6, 0, 1.0, 0, 0.18, null, null],
  ['rice', 'White rice, cooked', 'g', 130, 2.7, 28.2, 0.3, 0.1, 0.1, 0.4, 0, [150, '1 cup'], null],
  ['milk', 'Whole milk', 'ml', 64, 3.3, 4.8, 3.6, 4.8, 2.3, 0, 0.1, [250, '1 glass'], '5000000000028'],
  ['egg', 'Egg, whole', 'g', 143, 12.6, 0.7, 9.5, 0.4, 3.1, 0, 0.36, [50, '1 large'], null],
  ['greek', 'Greek yoghurt 2%', 'g', 73, 10, 3.9, 2, 3.6, 1.3, 0, 0.09, [170, '1 pot'], '5000000000035'],
  ['olive', 'Olive oil', 'ml', 824, 0, 0, 91.6, 0, 12.6, 0, 0, [10, '1 tbsp'], null],
  ['pb', 'Peanut butter', 'g', 588, 25, 20, 50, 9.2, 10.3, 6, 0.4, [32, '2 tbsp'], '5000000000042'],
  ['whey', 'Whey protein powder', 'g', 400, 78, 8, 6, 5, 3.5, null, 0.5, [30, '1 scoop'], '5000000000059'],
  ['bread', 'Wholemeal bread', 'g', 247, 13, 41, 3.4, 6, 0.7, 7, 1.0, [38, '1 slice'], '5000000000066'],
  ['apple', 'Apple', 'g', 52, 0.3, 13.8, 0.2, 10.4, 0, 2.4, 0, [182, '1 medium'], null],
  ['salmon', 'Salmon fillet, baked', 'g', 208, 20, 0, 13, 0, 3.1, 0, 0.15, null, null],
  ['broccoli', 'Broccoli, steamed', 'g', 35, 2.4, 7.2, 0.4, 1.4, 0.1, 3.3, 0.1, null, null],
  ['pasta', 'Pasta, cooked', 'g', 158, 5.8, 30.9, 0.9, 0.6, 0.2, 1.8, 0, [180, '1 plate'], null],
  ['avocado', 'Avocado', 'g', 160, 2, 8.5, 14.7, 0.7, 2.1, 6.7, 0.02, [100, '½ avocado'], null],
  ['almonds', 'Almonds', 'g', 579, 21.2, 21.6, 49.9, 4.4, 3.8, 12.5, 0, [28, '1 handful'], null],
  ['cheddar', 'Cheddar cheese', 'g', 403, 24.9, 1.3, 33.1, 0.5, 21.1, 0, 1.6, [30, '1 slice'], null],
  ['potato', 'Potato, boiled', 'g', 87, 1.9, 20.1, 0.1, 0.9, 0, 1.8, 0, null, null],
  ['oj', 'Orange juice', 'ml', 45, 0.7, 10.4, 0.2, 8.4, 0, 0.2, 0, [200, '1 glass'], '5000000000073'],
  ['lentils', 'Lentils, cooked', 'g', 116, 9, 20.1, 0.4, 1.8, 0.1, 7.9, 0, null, null],
  ['tofu', 'Tofu, firm', 'g', 144, 15.8, 2.8, 8.7, 0.6, 1.3, 2.3, 0.03, null, null],
  ['skyr', 'Skyr, plain', 'g', 63, 11, 4, 0.2, 4, 0.1, 0, 0.1, [150, '1 pot'], '5000000000080'],
  ['coffee', 'Coffee, black', 'ml', 2, 0.3, 0, 0, 0, 0, 0, 0, [240, '1 mug'], null],
  ['blueberries', 'Blueberries', 'g', 57, 0.7, 14.5, 0.3, 10, 0, 2.4, 0, [80, '1 portion'], null],
  ['beef', 'Lean beef mince, cooked', 'g', 217, 26.1, 0, 12.3, 0, 4.9, 0, 0.18, null, null],
];

export const SAMPLE_FOODS: Food[] = rows.map(([id, name, unit, kcal, protein, carbs, fat, sugars, saturates, fibre, salt, serving, barcode]) => ({
  id: `sample:${id}`,
  name,
  brand: null,
  barcode,
  origin: 'sample',
  refAmount: 100,
  refUnit: unit,
  servingSize: serving ? serving[0] : null,
  servingLabel: serving ? serving[1] : null,
  kcal,
  protein,
  carbs,
  fat,
  sugars,
  saturates,
  fibre,
  salt,
  ingredients: null,
}));
