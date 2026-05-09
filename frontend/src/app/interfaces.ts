export interface PubmedResult {
    pmid: string;
    title: string;
   
}

export interface ICD11Result {
    code: string;
    title: string;
   
}

export interface SymptomAnalysis {
    possible_conditions: {
        name: string;
        likelihood: number;
        reasoning: string;
    }[];
    icd11_matches: ICD11Result[];
    pubmed_matches: PubmedResult[];
}