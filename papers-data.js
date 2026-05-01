// 统一的论文数据源，供主页和方向页共用
const papers = [
    {
        title: "UAVs meet LLMs: Overviews and perspectives towards agentic low-altitude mobility",
        url: "https://www.sciencedirect.com/science/article/pii/S1566253525002313",
        venue: "Information Fusion 2025",
        img: "files/images/UAVS.png",
        date: "Oct. 2025",
        authors: '<a href="group.html#yonglin-tian">Yonglin Tian</a>, Fei Lin, Yiduo Li, Tengchao Zhang, <a href="group.html#qiyao-zhang">Qiyao Zhang</a>, Xuan Fu, Jun Huang, Xingyuan Dai, Yutong Wang, Chunwei Tian, Bai Li, Yisheng Lv, Levente Kovács, Fei-Yue Wang*',
        tags: ["Low-altitude Perception", "Low-altitude Coordination", "Low-altitude Maneuvering", "Low-altitude Operation"]
    },
    {
        title: "AIR-VLA: Vision-Language-Action Systems for Aerial Manipulation",
        url: "https://arxiv.org/abs/2601.21602",
        venue: "ICML 2026",
        img: "files/images/AIR-VLA.png",
        date: "Jan. 2026",
        authors: '<a href="group.html#jianli-sun">Jianli Sun</a>, Bin Tian, <a href="group.html#qiyao-zhang">Qiyao Zhang</a>, <a href="group.html#chengxiang-li">Chengxiang Li</a>, <a href="group.html#zihan-song">Zihan Song</a>, Zhiyong Cui, Yisheng Lv, <a href="group.html#yonglin-tian">Yonglin Tian*</a>',
        tags: ["Low-altitude Operation"]
    },
    {
        title: "UAV-Track VLA: Embodied Aerial Tracking via Vision-Language-Action Models",
        url: "https://flying-intelligence-team.github.io/UAV-Track-VLA-Web/",
        venue: "arXiv",
        img: "files/images/UAV-Track-VLA.png",
        date: "Apr. 2026",
        authors: '<a href="group.html#qiyao-zhang">Qiyao Zhang</a>, Shuhua Zheng, <a href="group.html#jianli-sun">Jianli Sun</a>, <a href="group.html#chengxiang-li">Chengxiang Li</a>, <a href="group.html#xianke-wu">Xianke Wu</a>, <a href="group.html#zihan-song">Zihan Song</a>, Zhiyong Cui, Yisheng Lv, <a href="group.html#yonglin-tian">Yonglin Tian*</a>',
        tags: ["Low-altitude Maneuvering"],
        video: "files/videos/uav-track-vla.mp4"
    },
    {
        title: "OpenCOOD-Air: Prompting Heterogeneous Ground-Air Collaborative Perception with Spatial Conversion and Offset Prediction",
        url: "https://arxiv.org/abs/2603.13919",
        venue: "arXiv",
        img: "files/images/opencood-air.png",
        date: "Mar. 2026",
        authors: '<a href="group.html#xianke-wu">Xianke Wu</a>, Songlin Bai, <a href="group.html#chengxiang-li">Chengxiang Li</a>, Zhiyao Luo, Yulin Tian, Fenghua Zhu, Yisheng Lv, <a href="group.html#yonglin-tian">Yonglin Tian*</a>',
        tags: ["Low-altitude Perception"],
        video: "files/videos/opencood-air.mp4"
    },
    {
        title: "CogRail: Benchmarking VLMs in Cognitive Intrusion Perception for Intelligent Railway Transportation Systems",
        url: "https://arxiv.org/abs/2601.09613",
        venue: "arXiv",
        img: "files/images/CogRail.png",
        date: "Jan. 2026",
        authors: '<a href="group.html#yonglin-tian">Yonglin Tian</a>, <a href="group.html#qiyao-zhang">Qiyao Zhang</a>, Wei Xu, Yutong Wang, <a href="group.html#yihao-wu">Yihao Wu</a>, <a href="group.html#xinyi-li">Xinyi Li</a>, Xingyuan Dai, Hui Zhang, Zhiyong Cui, Baoqing Guo, Zujun Yu, Yisheng Lv*',
        tags: ["Low-altitude Perception"]
    },
    {
        title: "LogisticsVLN: Vision-Language Navigation For Low-Altitude Terminal Delivery Based on Agentic UAVs",
        url: "https://ieeexplore.ieee.org/abstract/document/11423269",
        venue: "ITSC 2025",
        img: "files/images/LogisticsVLN.png",
        date: "May 2025",
        authors: '<a href="group.html#xinyuan-zhang">Xinyuan Zhang</a>, <a href="group.html#yonglin-tian">Yonglin Tian</a>, Fei Lin, Yue Liu, Jing Ma, Kornelia S ´ ara Szatm ´ ary, Fei-Yue Wang*',
        tags: ["Low-altitude Maneuvering"]
    },
];