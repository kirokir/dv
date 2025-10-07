let csvData = [];
let chart = null;

function loadCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (!file) return alert('Please select a CSV file');

    Papa.parse(file, {
        header: true,
        dynamicTyping: true,  // Auto-convert numbers, dates, etc.
        skipEmptyLines: true,
        complete: function(results) {
            csvData = results.data;
            if (results.errors.length) {
                console.error('CSV Parse Errors:', results.errors);
                alert('Errors parsing CSV. Check console for details.');
            }
            displayPreview();
        },
        error: function(err) {
            alert('Error loading CSV: ' + err.message);
        }
    });
}

function displayPreview() {
    const table = document.getElementById('dataTable');
    table.innerHTML = '';
    
    if (!csvData.length || !csvData[0]) return alert('No data in CSV');
    
    // Headers
    const thead = document.createElement('thead');
    const headerRow = thead.insertRow();
    Object.keys(csvData[0]).forEach(key => {
        const th = document.createElement('th');
        th.textContent = key;
        headerRow.appendChild(th);
    });
    table.appendChild(thead);
    
    // Sample rows (first 5)
    const tbody = document.createElement('tbody');
    csvData.slice(0, 5).forEach(row => {
        const tr = tbody.insertRow();
        Object.values(row).forEach(val => {
            const td = tr.insertCell();
            td.textContent = val;
        });
    });
    table.appendChild(tbody);
    
    // Populate column selects
    const columns = Object.keys(csvData[0]);
    ['xCol', 'yCol', 'groupCol'].forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = id === 'groupCol' ? '<option value="">None</option>' : '<option value="">Select...</option>';
        select.innerHTML += columns.map(col => `<option value="${col}">${col}</option>`).join('');
    });
    
    document.getElementById('dataPreview').style.display = 'block';
    document.getElementById('chartSection').style.display = 'block';
}

function renderChart() {
    const xCol = document.getElementById('xCol').value;
    const yCol = document.getElementById('yCol').value;
    const groupCol = document.getElementById('groupCol').value;
    const chartTypeSelect = document.getElementById('chartType');
    const type = chartTypeSelect.value;
    const isStacked = chartTypeSelect.selectedOptions[0].dataset.stacked === 'true';
    const isArea = chartTypeSelect.selectedOptions[0].dataset.area === 'true';

    if (!yCol) return alert('Select Y column');
    if (type !== 'histogram' && type !== 'boxplot' && !xCol) return alert('Select X column');
    if (type === 'boxplot' && !groupCol) return alert('Boxplot requires a Group column');

    const canvas = document.getElementById('myChart');
    const ctx = canvas.getContext('2d');
    if (chart) {
        chart.destroy();
        chart = null;  // Clear reference to avoid resize issues
    }

    let labels = [];
    let datasets = [];

    if (groupCol && type !== 'pie' && type !== 'histogram' && type !== 'boxplot') {
        const groups = [...new Set(csvData.map(d => d[groupCol]).filter(g => g != null))];
        if (!groups.length) return alert('No valid groups found');
        datasets = groups.map((group, i) => {
            const subset = csvData.filter(d => d[groupCol] === group);
            return {
                label: group,
                data: subset.map(d => d[yCol]),
                backgroundColor: `hsl(${i * 360 / groups.length}, 70%, 50%)`,
                borderColor: `hsl(${i * 360 / groups.length}, 70%, 30%)`,
                fill: isArea
            };
        });
        labels = [...new Set(csvData.map(d => d[xCol]).filter(l => l != null))];
    } else if (type !== 'pie' && type !== 'histogram' && type !== 'boxplot') {
        labels = csvData.map(d => d[xCol]).filter(l => l != null);
        datasets = [{
            label: yCol,
            data: csvData.map(d => d[yCol]),
            backgroundColor: 'rgba(75,192,192,0.2)',
            borderColor: 'rgba(75,192,192,1)',
            fill: isArea
        }];
    }

    const config = {
        type: type,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,  // Helps with resize
            plugins: { title: { display: true, text: `${type.toUpperCase()} Chart` } },
            scales: type !== 'pie' ? { y: { beginAtZero: true } } : {}
        }
    };

    // Special cases
    if (type === 'pie') {
        const aggMap = new Map();
        csvData.forEach(d => {
            const key = d[xCol];
            const val = d[yCol];
            if (key != null && typeof val === 'number') {
                aggMap.set(key, (aggMap.get(key) || 0) + val);
            }
        });
        if (!aggMap.size) return alert('No valid data for pie chart');
        config.data = {
            labels: Array.from(aggMap.keys()),
            datasets: [{
                data: Array.from(aggMap.values()),
                backgroundColor: Array.from(aggMap.keys()).map((_, i) => `hsl(${i * 360 / aggMap.size}, 70%, 50%)`)
            }]
        };
    } else if (type === 'scatter') {
        config.data.datasets = datasets.map(ds => ({
            ...ds,
            data: csvData
                .filter(d => (groupCol ? d[groupCol] === ds.label : true) && typeof d[xCol] === 'number' && typeof d[yCol] === 'number')
                .map(d => ({ x: d[xCol], y: d[yCol] }))
        }));
        if (!config.data.datasets[0].data.length) return alert('No valid numeric data for scatter');
        config.options.scales.x = { type: 'linear' };
    } else if (type === 'histogram') {
        const values = csvData.map(d => d[yCol]).filter(v => typeof v === 'number');
        if (!values.length) return alert('No numeric data for histogram');
        const min = Math.min(...values);
        const max = Math.max(...values);
        const bins = 10;
        const binWidth = (max - min) / bins;
        const binCounts = Array(bins).fill(0);
        values.forEach(v => {
            const bin = Math.min(Math.floor((v - min) / binWidth), bins - 1);
            binCounts[bin]++;
        });
        config.type = 'bar';
        config.data = {
            labels: Array(bins).fill().map((_, i) => `${(min + i * binWidth).toFixed(2)} - ${(min + (i + 1) * binWidth).toFixed(2)}`),
            datasets: [{ label: 'Frequency', data: binCounts, backgroundColor: 'rgba(75,192,192,0.5)' }]
        };
    } else if (type === 'boxplot') {
        const groups = [...new Set(csvData.map(d => d[groupCol]).filter(g => g != null))];
        if (!groups.length) return alert('No valid groups for boxplot');
        config.data = {
            labels: groups,
            datasets: [{
                label: yCol,
                data: groups.map(group => 
                    csvData.filter(d => d[groupCol] === group).map(d => d[yCol]).filter(v => typeof v === 'number')
                ),
                backgroundColor: 'rgba(75,192,192,0.2)',
                borderColor: 'rgba(75,192,192,1)',
                outlierColor: '#999999'
            }]
        };
    }

    if (isStacked && type === 'bar') {
        config.options.scales = {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
        };
    }

    try {
        chart = new Chart(ctx, config);
        document.getElementById('chartContainer').style.display = 'block';
    } catch (e) {
        alert('Error rendering chart: ' + e.message);
    }
}

function downloadChart(format) {
    const canvas = document.getElementById('myChart');
    if (format === 'png') {
        html2canvas(canvas).then(img => {
            const link = document.createElement('a');
            link.download = 'chart.png';
            link.href = img.toDataURL('image/png');
            link.click();
        });
    }
}