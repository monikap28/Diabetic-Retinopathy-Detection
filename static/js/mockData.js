// Historic regression metrics, health trends, and screening database for the Analytics component

export const mockAnalyticsData = {
    // Epoch vs Validation Cohen's Quadratic Kappa Index (simulating ML model training progress)
    kappaHistory: [
        { epoch: 1, trainLoss: 0.8421, valKappa: 0.4215 },
        { epoch: 5, trainLoss: 0.5124, valKappa: 0.6120 },
        { epoch: 10, trainLoss: 0.3250, valKappa: 0.7431 },
        { epoch: 15, trainLoss: 0.2104, valKappa: 0.8124 },
        { epoch: 20, trainLoss: 0.1458, valKappa: 0.8652 },
        { epoch: 25, trainLoss: 0.0984, valKappa: 0.8912 },
        { epoch: 30, trainLoss: 0.0612, valKappa: 0.9124 } // Target validation kappa matching the notebook
    ],
    
    // Severity grade counts across 1,248 processed scans
    severityDistribution: [
        { grade: 0, label: "No DR", count: 642, percentage: 51.4 },
        { grade: 1, label: "Mild NPDR", count: 185, percentage: 14.8 },
        { grade: 2, label: "Moderate NPDR", count: 243, percentage: 19.5 },
        { grade: 3, label: "Severe NPDR", count: 112, percentage: 9.0 },
        { grade: 4, label: "Proliferative DR", count: 66, percentage: 5.3 }
    ],

    // Patient classification performance matrix (confusion matrix)
    confusionMatrix: {
        labels: ["No DR", "Mild", "Moderate", "Severe", "Proliferative"],
        matrix: [
            [610, 24, 8, 0, 0],       // Actual No DR
            [15, 155, 15, 0, 0],      // Actual Mild
            [4, 18, 208, 13, 0],      // Actual Moderate
            [0, 2, 10, 94, 6],        // Actual Severe
            [0, 0, 1, 5, 60]          // Actual Proliferative
        ]
    },

    // Mock patient history records
    recentScreenings: [
        {
            id: "DR-8924",
            name: "Eleanor Vance",
            age: 62,
            gender: "Female",
            date: "2026-06-19 12:40",
            grade: 2,
            label: "Moderate NPDR",
            confidence: 0.9412,
            pathologies: ["Microaneurysms", "Retinal Hemorrhages"],
            status: "Reviewed"
        },
        {
            id: "DR-8923",
            name: "Marcus Aurelius",
            age: 55,
            gender: "Male",
            date: "2026-06-19 11:15",
            grade: 0,
            label: "No DR",
            confidence: 0.9856,
            pathologies: [],
            status: "Reviewed"
        },
        {
            id: "DR-8922",
            name: "Sarah Jenkins",
            age: 47,
            gender: "Female",
            date: "2026-06-18 16:30",
            grade: 4,
            label: "Proliferative DR",
            confidence: 0.9789,
            pathologies: ["Microaneurysms", "Hard Exudates", "Neovascularization", "Pre-retinal Hemorrhages"],
            status: "Action Required"
        },
        {
            id: "DR-8921",
            name: "Thomas Wright",
            age: 70,
            gender: "Male",
            date: "2026-06-18 09:45",
            grade: 1,
            label: "Mild NPDR",
            confidence: 0.8841,
            pathologies: ["Microaneurysms"],
            status: "Reviewed"
        },
        {
            id: "DR-8920",
            name: "Linda Harrison",
            age: 51,
            gender: "Female",
            date: "2026-06-17 14:20",
            grade: 3,
            label: "Severe NPDR",
            confidence: 0.9254,
            pathologies: ["Microaneurysms", "Retinal Hemorrhages", "Cotton Wool Spots"],
            status: "Action Required"
        }
    ],

    // Global performance indices
    performanceIndicators: {
        quadraticKappa: 0.9124,
        sensitivity: 0.932,
        specificity: 0.951,
        totalScreened: 1248
    }
};
