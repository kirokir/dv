let csvData = [];
let chart = null;

function loadCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (!file) return alert('Please select a CSV file');

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            csvData = results.data.map(row => {
                // Convert numeric fields to numbers
                Object.keys(row).forEach(key => {
                    if (!isNaN(row[key]) && row[key] !== '') {
                        row[key] = +row[key];
                    }
                });
                return row;
            });
            displayPreview();
        },
        error: function(err) {
            alert('Error parsing CSV: ' + err.message);
        }
    });
}

function displayPreview() {
    const table = document.getElementById('dataTable');
    table.innerHTML = '';
    
    if (!csvData.length) return alert('No data in CSV');
    
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

    if (!xCol && type !== 'histogram' && type !== 'boxplot') return alert('Select X column');
    if (!yCol) return alert('Select Y column');
    if (type === 'boxplot' && !groupCol) return alert('Boxplot requires a Group column');

    const ctx = document.getElementById('myChart').getContext('2d');
    if (chart) {
        chart.destroy(); // Destroy previous chart
    }

    let datasets = [];
    let labels = [];

    if (groupCol && type !== 'pie' && type !== 'boxplot') {
        const groups = [...new Set(csvData.map(d => d[groupCol]))].filter(g => g !== undefined && g !== '');
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
        labels = [...new Set(csvData.map(d => d[xCol]))].filter(l => l !== undefined && l !== '');
    } else if (type !== 'pie' && type !== 'boxplot' && type !== 'histogram') {
        labels = csvData.map(d => d[xCol]);
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
            plugins: { title: { display: true, text: `${type.toUpperCase()} Chart` } },
            scales: type !== 'pie' ? { y: { beginAtZero: true } } : {}
        }
    };

    // Special cases
    if (type === 'pie') {
        config.data = {
            labels: csvData.map(d => d[xCol]),
            datasets: [{
                data: csvData.map(d => d[yCol]),
                backgroundColor: csvData.map((_, i) => `hsl(${i * 360 / csvData.length}, 70%, 50%)`)
            }]
        };
    } else if (type === 'scatter') {
        config.data.datasets = datasets.map(ds => ({
            ...ds,
            data: csvData.filter(d => groupCol ? d[groupCol] === ds.label : true).map(d => ({ x: d[xCol], y: d[yCol] }))
        }));
        config.options.scales.x = { type: 'linear' };
    } else if (type === 'histogram') {
        // Simple histogram: bin Y values
        const values = csvData.map(d => d[yCol]).filter(v => !isNaN(v));
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
            labels: Array(bins).fill().map((_, i) => (min + i * binWidth).toFixed(2)),
            datasets: [{ label: 'Frequency', data: binCounts, backgroundColor: 'rgba(75,192,192,0.5)' }]
        };
    } else if (type === 'boxplot') {
        const groups = [...new Set(csvData.map(d => d[groupCol]))].filter(g => g !== undefined && g !== '');
        config.type = 'boxplot';
        config.data = {
            labels: groups,
            datasets: [{
                label: yCol,
                data: groups.map(group => {
                    const values = csvData.filter(d => d[groupCol] === group).map(d => d[yCol]).filter(v => !isNaN(v));
                    return {
                        min: Math.min(...values),
                        max: Math.max(...values),
                        median: values.sort((a, b) => a - b)[Math.floor(values.length / 2)],
                        q1: values.sort((a, b) => a - b)[Math.floor(values.length / 4)],
                        q3: values.sort((a, b) => a - b)[Math.floor(3 * values.length / 4)],
                        items: values
                    };
                }),
                backgroundColor: 'rgba(75,192,192,0.2)',
                borderColor: 'rgba(75,192,192,1)'
            }]
        };
    }

    if (isStacked && type === 'bar') {
        config.options.scales = {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
        };
    }

    chart = new Chart(ctx, config);
    document.getElementById('chartContainer').style.display = 'block';
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