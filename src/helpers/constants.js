const LOCAL_API_URL = 'http://127.0.0.1:5000';

const COLOR1 =  [37, 206, 209];
const COLOR2 = [128, 155, 206];
const COLOR3 = [255, 138, 91];
const COLOR4 = [232, 82, 111];
const COLOR5 =  [250, 192, 94];
const COLOR6 = [89, 205, 144];
const COLOR7 = [25, 147, 251];
const COLOR8 = [209, 17, 73];
const SIGNAL_COLORS = [COLOR1, COLOR2, COLOR3, COLOR4];
const BASE_PAIR_COLORS = [COLOR5, COLOR6, COLOR7, COLOR8];
const MAX_BASE_PAIR_WIDTH = 32;
const TRACK_DATA_TYPE_BASE_PAIRS = 'basepairs';
const TRACK_DATA_TYPE_GBANDS = 'gbands';
const TRACK_DATA_TYPE_SIGNAL = 'signal';
const CHROMOSOME_SIZES = [
	248956422, 
	242193529, 
	198295559, 
	190214555, 
	181538259, 
	170805979,
	159345973,
	145138636,
	138394717,
	133797422,
	135086622,
	133275309,
	114364328,
	107043718,
	101991189,
	90338345,
	83257441,
	80373285,
	58617616,
	64444167,
	46709983,
	50818468,
	156040895,
	57227415,
];

const CHROMOSOME_START_BASE_PAIRS = [0];
for (let i = 0; i < CHROMOSOME_SIZES.length; i++) {
	const currSize = CHROMOSOME_START_BASE_PAIRS[i] + CHROMOSOME_SIZES[i];
	CHROMOSOME_START_BASE_PAIRS.push(currSize);
}

const GENOME_LENGTH = CHROMOSOME_START_BASE_PAIRS[CHROMOSOME_START_BASE_PAIRS.length - 1];

const CHROMOSOME_NAMES = [];
for (let i = 1; i < 23; i++) {
	CHROMOSOME_NAMES.push(`Chr${i}`);
}
CHROMOSOME_NAMES.push('ChrX');
CHROMOSOME_NAMES.push('ChrY');

export { 
	GENOME_LENGTH, 
	LOCAL_API_URL,
	TRACK_DATA_TYPE_SIGNAL,
	TRACK_DATA_TYPE_GBANDS,
	TRACK_DATA_TYPE_BASE_PAIRS,
	COLOR1,
	COLOR2,
	COLOR3,
	COLOR4,
	COLOR5,
	COLOR6,
	COLOR7,
	COLOR8,
	SIGNAL_COLORS,
	BASE_PAIR_COLORS,
	CHROMOSOME_SIZES,
	CHROMOSOME_START_BASE_PAIRS,
        CHROMOSOME_NAMES,
};
