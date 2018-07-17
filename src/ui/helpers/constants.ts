// These const strings should be consistent with backend sirius.realdata.constants
const DATA_SOURCE_GENOME = 'GRCh38_gff';
const DATA_SOURCE_GWAS = 'GWAS';
const DATA_SOURCE_EXSNP = 'exSNP';
const DATA_SOURCE_CLINVAR = 'ClinVar';
const DATA_SOURCE_DBSNP = 'dbSNP';
const DATA_SOURCE_ENCODE = 'ENCODE';
const DATA_SOURCE_FASTA = 'RefSeq';
const DATA_SOURCE_EFO = 'EFO';
const DATA_SOURCE_ENCODEbigwig = 'ENCODEbigwig';
const DATA_SOURCE_ExAC = 'ExAC';
const DATA_SOURCE_TCGA = 'TCGA';
const DATA_SOURCE_ENSEMBL = 'ENSEMBL';
const DATA_SOURCE_GTEX = 'GTEx';

const CHROMOSOME_NAMES: Array<string> = [];
for (let i = 1; i < 23; i++) {
  CHROMOSOME_NAMES.push(`chr${i}`);
}

CHROMOSOME_NAMES.push('chrX');
CHROMOSOME_NAMES.push('chrY');

const VARIANT_TAGS = ['is_common', 'missense_variant', 'regulatory_region_variant', 'upstream_gene_variant', 'synonymous_variant', 'TF_binding_site_variant', 'intron_variant', 'non_coding_transcript_exon_variant', 'non_coding_transcript_variant', 'downstream_gene_variant', 'splice_region_variant', 'frameshift_variant', 'loss_of_function', 'splice_acceptor_variant', 'splice_donor_variant', 'stop_gained', '5_prime_UTR_variant', 'NMD_transcript_variant', '3_prime_UTR_variant', 'coding_sequence_variant', 'inframe_deletion', 'inframe_insertion', 'stop_lost', 'start_lost', 'incomplete_terminal_codon_variant', 'stop_retained_variant', 'intergenic_variant', 'protein_altering_variant', 'mature_miRNA_variant', 'TFBS_ablation', 'transcript_ablation'];
const DATA_SOURCES = [
  DATA_SOURCE_GENOME,
  DATA_SOURCE_GWAS,
  DATA_SOURCE_EXSNP,
  DATA_SOURCE_CLINVAR,
  DATA_SOURCE_DBSNP,
  DATA_SOURCE_ENCODE,
  DATA_SOURCE_FASTA,
  DATA_SOURCE_EFO,
  DATA_SOURCE_ENCODEbigwig,
  DATA_SOURCE_ExAC,
  DATA_SOURCE_TCGA,
  DATA_SOURCE_ENSEMBL,
  DATA_SOURCE_GTEX
];

export {
  CHROMOSOME_NAMES,
  DATA_SOURCE_GENOME,
  DATA_SOURCE_GWAS,
  DATA_SOURCE_EXSNP,
  DATA_SOURCE_CLINVAR,
  DATA_SOURCE_DBSNP,
  DATA_SOURCE_ENCODE,
  DATA_SOURCE_FASTA,
  DATA_SOURCE_EFO,
  DATA_SOURCE_ENCODEbigwig,
  DATA_SOURCE_ExAC,
  DATA_SOURCE_TCGA,
  DATA_SOURCE_ENSEMBL,
  DATA_SOURCE_GTEX,
  DATA_SOURCES,
  VARIANT_TAGS,
};
