let csvData = [];
let chart = null;

function loadCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (!file) return alert('Select a CSV file');

    Papa.parse(file, {
        header: true,
        complete: function(results) {
            csvData = results.data;
            displayPreview();
        }
    });
}

function displayPreview() {
    const table = document.getElementById('dataTable');
    table.innerHTML = '';
    
    // Headers
    const thead = document.createElement('thead');
    const headerRow = thead.insertRow();
    Object.keys(csvData[0] || {}).forEach(key => {
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
    const columns = Object.keys(csvData[0] || {});
    ['xCol', 'yCol', 'groupCol'].forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = '<option value="">Select...</option>' + columns.map(col => `<option value="${col}">${col}</option>`).join('');
    });
    
    document.getElementById('dataPreview').style.display = 'block';
    document.getElementById('chartSection').style.display = 'block';
}

function renderChart() {
    const xCol = document.getElementById('xCol').value;
    const yCol = document.getElementById('yCol').value;
    const groupCol = document.getElementById('groupCol').value;
    const type = document.getElementById('chartType').value;
    const isStacked = document.querySelector(`#chartType option[value="${type}"]:checked`).dataset.stacked;
    const isArea = document.querySelector(`#chartType option[value="${type}"]:checked`).dataset.area; // Note: Adjust select for options

    if (!xCol || !yCol) return alert('Select X and Y columns');

    const ctx = document.getElementById('myChart').getContext('2d');
    if (chart) chart.destroy();

    let datasets = [];
    if (groupCol) {
        // Grouped data
        const groups = [...new Set(csvData.map(d => d[groupCol]))];
        groups.forEach(group => {
            const subset = csvData.filter(d => d[groupCol] === group);
            const data = subset.map(d => d[yCol]);
            const labels = subset.map(d => d[xCol]);
            datasets.push({
                label: group,
                data: data,
                backgroundColor: `hsl(${groups.indexOf(group) * 360 / groups.length}, 70%, 50%)`
            });
        });
    } else {
        // Simple
        const labels = csvData.map(d => d[xCol]);
        const data = csvData.map(d => d[yCol]);
        datasets = [{ label: yCol, data, backgroundColor: 'rgba(75,192,192,0.2)', borderColor: 'rgba(75,192,192,1)' }];
    }

    const config = {
        type: type,
        data: { labels: groupCol ? csvData.map(d => d[xCol]) : labels, datasets },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: `${type.toUpperCase()} Chart` } },
            scales: { y: { beginAtZero: true } }
        }
    };

    // Special cases
    if (type === 'pie') {
        config.type = 'pie';
        config.data = {
            labels: csvData.map(d => d[xCol]),
            datasets: [{ data: csvData.map(d => d[yCol]), backgroundColor: 'hsl(' + csvData.map((_, i) => i * 360 / csvData.length) + ', 70%, 50%)' }]
        };
    } else if (type === 'scatter') {
        config.data.datasets = datasets.map(ds => ({
            label: ds.label,
            data: csvData.map(d => ({ x: d[xCol], y: d[yCol] })),
            backgroundColor: ds.backgroundColor
        }));
        config.options.scales.x = { type: 'linear' };
    } else if (type === 'histogram') {
        config.type = 'bar';
        config.data = { labels: [], datasets: [{ label: 'Frequency', data: csvData.map(d => d[yCol]) }] };
        // Basic hist: Use Chart.js binning or pre-bin in JS
    } // Boxplot: Chart.js doesn't native; use plugin or approximate with violin (advanced; skip for now or add chartjs-chart-box-and-violin)

    chart = new Chart(ctx, config);
    document.getElementById('chartContainer').style.display = 'block';
}

function downloadChart(format) {
    const canvas = document.getElementById('myChart');
    if (format === 'png') {
        html2canvas(canvas).then(img => {
            const link = document.createElement('a');
            link.download = 'chart.png';
            link.href = img.toDataURL();
            link.click();
        });
    } else if (format === 'svg') {
        // Chart.js to SVG: Serialize canvas or use svg renderer
        const svg = canvas.toDataURL('image/svg+xml');
        const link = document.createElement('a');
        link.download = 'chart.svg';
        link.href = svg;
        link.click();
    }
}