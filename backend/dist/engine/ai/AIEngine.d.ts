export interface AIAnalysisRequest {
    type: 'FRAUD_DETECTION' | 'ANOMALY_DETECTION' | 'CREDIT_SCORING' | 'RISK_ASSESSMENT' | 'PROFIT_ANALYSIS' | 'PREDICTION' | 'RECOMMENDATION' | 'REPORT_GENERATION' | 'DATA_QUALITY' | 'SYSTEM_HEALTH' | 'EXECUTIVE_SUMMARY';
    organizationId: string;
    parameters?: Record<string, any>;
}
export interface AIAnalysisResult {
    success: boolean;
    type: string;
    summary: string;
    findings: any[];
    recommendations: string[];
    confidence: number;
    generatedAt: Date;
}
export declare class AIEngine {
    private static instance;
    private constructor();
    static getInstance(): AIEngine;
    /**
     * Perform AI analysis across the entire platform
     */
    analyze(request: AIAnalysisRequest): Promise<AIAnalysisResult>;
    /**
     * Detect fraudulent activities across the system
     */
    private detectFraud;
    /**
     * Detect anomalies in transactions and member behavior
     */
    private detectAnomalies;
    /**
     * Calculate credit score for a member
     */
    private calculateCreditScore;
    /**
     * Assess overall risk for organization
     */
    private assessRisk;
    /**
     * Analyze project profitability
     */
    private analyzeProfitability;
    /**
     * Make predictions (loan defaults, savings growth, etc.)
     */
    private makePrediction;
    /**
     * Generate recommendations for improvement
     */
    private generateRecommendations;
    /**
     * Generate an executive summary of the organization
     */
    private generateExecutiveSummary;
    /**
     * Check data quality across the system
     */
    private checkDataQuality;
    /**
     * Check system health
     */
    private checkSystemHealth;
    /**
     * Generate a comprehensive report
     */
    private generateReport;
}
//# sourceMappingURL=AIEngine.d.ts.map