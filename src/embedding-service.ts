import { pipeline, env } from '@xenova/transformers';

// Disable local cache for better deployment compatibility
env.allowLocalModels = false;
env.allowRemoteModels = true;

interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

interface SimilarityResult {
  similarity: number;
  id: number;
  content: string;
  type: 'memory' | 'task';
}

class EmbeddingService {
  private embedder: any = null;
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2';
  private readonly dimensions = 384; // all-MiniLM-L6-v2 produces 384-dim embeddings
  
  /**
   * Initialize the embedding model
   * This is called lazily on first use to avoid startup delays
   */
  private async initializeModel(): Promise<void> {
    if (this.embedder) return;
    
    try {
      console.error('[Embedding] Loading embedding model...');
      this.embedder = await pipeline('feature-extraction', this.modelName);
      console.error('[Embedding] Model loaded successfully');
    } catch (error) {
      console.error('[Embedding] Failed to load model:', error);
      throw new Error('Failed to initialize embedding model');
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    await this.initializeModel();
    
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    try {
      // Clean and truncate text for better embedding quality
      const cleanText = this.preprocessText(text);
      
      // Generate embedding
      const output = await this.embedder(cleanText, {
        pooling: 'mean',
        normalize: true,
      });
      
      // Extract embedding array
      const embedding = Array.from(output.data) as number[];
      
      if (embedding.length !== this.dimensions) {
        throw new Error(`Unexpected embedding dimensions: expected ${this.dimensions}, got ${embedding.length}`);
      }
      
      return {
        embedding,
        model: this.modelName,
        dimensions: this.dimensions,
      };
    } catch (error) {
      console.error('[Embedding] Generation failed:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    
    // Process in batches to manage memory
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      for (const text of batch) {
        try {
          const result = await this.generateEmbedding(text);
          results.push(result);
        } catch (error) {
          console.error(`[Embedding] Failed to process text: ${text.substring(0, 50)}...`);
          // Push a zero vector as fallback
          results.push({
            embedding: new Array(this.dimensions).fill(0),
            model: this.modelName,
            dimensions: this.dimensions,
          });
        }
      }
      
      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(embeddingA: number[], embeddingB: number[]): number {
    if (embeddingA.length !== embeddingB.length) {
      throw new Error('Embeddings must have the same dimensions for similarity calculation');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < embeddingA.length; i++) {
      dotProduct += embeddingA[i] * embeddingB[i];
      normA += embeddingA[i] * embeddingA[i];
      normB += embeddingB[i] * embeddingB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Find most similar embeddings from a set of candidates
   */
  findMostSimilar(
    queryEmbedding: number[],
    candidates: { id: number; embedding: number[]; content: string; type: 'memory' | 'task' }[],
    topK: number = 10,
    minSimilarity: number = 0.1
  ): SimilarityResult[] {
    const similarities: SimilarityResult[] = [];

    for (const candidate of candidates) {
      try {
        const similarity = this.cosineSimilarity(queryEmbedding, candidate.embedding);
        
        if (similarity >= minSimilarity) {
          similarities.push({
            similarity,
            id: candidate.id,
            content: candidate.content,
            type: candidate.type,
          });
        }
      } catch (error) {
        console.error(`[Embedding] Similarity calculation failed for ${candidate.type} ${candidate.id}:`, error);
      }
    }

    // Sort by similarity (highest first) and return top K
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Preprocess text for better embedding quality
   */
  private preprocessText(text: string): string {
    // Clean up the text
    let cleaned = text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s\-.,!?;:()\[\]{}'"@#$%&]/g, ' ') // Remove special chars but keep punctuation
      .trim();

    // Truncate to reasonable length (transformers have token limits)
    // all-MiniLM-L6-v2 has a 512 token limit, roughly 400-500 characters
    if (cleaned.length > 400) {
      cleaned = cleaned.substring(0, 400).trim();
      // Try to end at a word boundary
      const lastSpace = cleaned.lastIndexOf(' ');
      if (lastSpace > 300) {
        cleaned = cleaned.substring(0, lastSpace);
      }
    }

    return cleaned;
  }

  /**
   * Create searchable text from memory or task object
   */
  createSearchableText(item: any, type: 'memory' | 'task'): string {
    let searchText = '';

    if (type === 'memory') {
      // For memories: title + content + category + project + tags
      searchText = [
        item.title || '',
        item.content || '',
        item.category || '',
        item.project || '',
        Array.isArray(item.tags) ? item.tags.join(' ') : (item.tags || ''),
      ]
        .filter(text => text.trim().length > 0)
        .join(' ')
        .trim();
    } else if (type === 'task') {
      // For tasks: title + description + status + category + project + tags
      searchText = [
        item.title || '',
        item.description || '',
        item.status || '',
        item.category || '',
        item.project || '',
        Array.isArray(item.tags) ? item.tags.join(' ') : (item.tags || ''),
      ]
        .filter(text => text.trim().length > 0)
        .join(' ')
        .trim();
    }

    return searchText;
  }

  /**
   * Get model info
   */
  getModelInfo() {
    return {
      name: this.modelName,
      dimensions: this.dimensions,
      loaded: this.embedder !== null,
    };
  }

  /**
   * Preload model (optional - for warming up)
   */
  async preloadModel(): Promise<void> {
    await this.initializeModel();
  }

  /**
   * Get the model name being used
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
export default embeddingService;
