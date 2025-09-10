export type TopicCategoryId =
  | 'fun'
  | 'tech'
  | 'philosophy'
  | 'society'
  | 'science'
  | 'entertainment'
  | 'health'
  | 'relationships';

export interface TopicCategory {
  id: TopicCategoryId;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export interface Topic {
  id: string;
  text: string; // Motion statement (not a question)
  categoryId: TopicCategoryId;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  popularity?: number; // 1-5
}

export interface TopicCatalog {
  categories: TopicCategory[];
  topics: Topic[];
}

