let csvData = [];
let chart = null;
let hot = null;

function loadCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (!file) return alert('Please select a CSV file');

    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            csvData = results.data;
            if (results.errors.length) {
                console.error('CSV Parse Errors:', results.errors);
                alert('Errors parsing CSV. Check console for details.');
            }
            if (!csvData.length || !csvData[0]) return alert('No data in CSV');
            displayTable();
        },
        error: function(err) {
            alert('Error loading CSV: ' + err.message);
        }
    });
}

function displayTable() {
    const container = document.getElementById('dataTable');
    if (hot) hot.destroy();

    const headers = Object.keys(csvData[0] || {});
    hot = new Handsontable(container, {
        data: csvData,
        rowHeaders: true,
        colHeaders: headers,
        contextMenu: true,
        manualColumnResize: true,
        manualRowResize: true,
        licenseKey: 'non-commercial-and-evaluation'
    });

    // Update csvData on table change
    hot.addHook('afterChange', () => {
        csvData = hot.getSourceData();
        updateColumnSelects();
    });

    updateColumnSelects();
    document.getElementById('dataPreview').style.display = 'block';
    document.getElementById('chartSection').style.display = 'block';
}

function addColumn() {
    const newColName = prompt('Enter new Y column name:', `Y${csvData[0] ? Object.keys(csvData[0]).length + 1 : 1}`);
    if (!newColName) return;
    csvData.forEach(row => row[newColName] = 0);
    displayTable();
}

function addRow() {
    const newRow = {};
    Object.keys(csvData[0] || {}).forEach(key => newRow[key] = '');
    csvData.push(newRow);
    displayTable();
}

function updateColumnSelects() {
    const columns = Object.keys(csvData[0] || {});
    ['xCol', 'yCol', 'groupCol'].forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = id === 'groupCol' ? '<option value="">None</option>' : '<option value="">Select...</option>';
        select.innerHTML += columns.map(col => `<option value="${col}">${col}</option>`).join('');
    });
}

function renderChart() {
    const xCol = document.getElementById('xCol').value;
    const yCols = Array.from(document.getElementById('yCol').selectedOptions).map(opt => opt.value);
    const groupCol = document.getElementById('groupCol').value;
    const chartTypeSelect = document.getElementById('chartType');
    const type = chartTypeSelect.value;
    const isStacked = chartTypeSelect.selectedOptions[0].dataset.stacked === 'true';
    const isArea = chartTypeSelect.selectedOptions[0].dataset.area === 'true';
    const title = document.getElementById('chartTitle').value || `${type.toUpperCase()} Chart`;

    if (!yCols.length) return alert('Select at least one Y column');
    if (type !== 'histogram' && type !== 'boxplot' && !xCol) return alert('Select X column');
    if (type === 'boxplot' && !groupCol) return alert('Boxplot requires a Group column');
    if (type === 'pie' && yCols.length > 1) return alert('Pie chart uses only the first Y column');

    const canvas = document.getElementById('myChart');
    const ctx = canvas.getContext('2d');
    if (chart) {
        chart.destroy();
        chart = null;
    }

    let labels = [];
    let datasets = [];

    if (groupCol && type !== 'pie' && type !== 'histogram' && type !== 'boxplot') {
        const groups = [...new Set(csvData.map(d => d[groupCol]).filter(g => g != null))];
        if (!groups.length) return alert('No valid groups found');
        datasets = groups.flatMap(group => 
            yCols.map((yCol, i) => ({
                label: `${yCol} (${group})`,
                data: csvData.filter(d => d[groupCol] === group).map(d => d[yCol]),
                backgroundColor: `hsl(${i * 360 / (yCols.length * groups.length)}, 70%, 50%)`,
                borderColor: `hsl(${i * 360 / (yCols.length * groups.length)}, 70%, 30%)`,
                fill: isArea
            }))
        );
        labels = [...new Set(csvData.map(d => d[xCol]).filter(l => l != null))];
    } else if (type !== 'pie' && type !== 'histogram' && type !== 'boxplot') {
        labels = csvData.map(d => d[xCol]).filter(l => l != null);
        datasets = yCols.map((yCol, i) => ({
            label: yCol,
            data: csvData.map(d => d[yCol]),
            backgroundColor: `hsl(${i * 360 / yCols.length}, 70%, 50%)`,
            borderColor: `hsl(${i * 360 / yCols.length}, 70%, 30%)`,
            fill: isArea
        }));
    }

    const config = {
        type: type,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: title } },
            scales: type !== 'pie' ? { y: { beginAtZero: true } } : {}
        }
    };

    if (type === 'pie') {
        const aggMap = new Map();
        csvData.forEach(d => {
            const key = d[xCol] || `Index ${csvData.indexOf(d)}`;
            const val = d[yCols[0]];
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
        config.data.datasets = yCols.map((yCol, i) => ({
            label: yCol,
            data: csvData
                .filter(d => typeof d[xCol] === 'number' && typeof d[yCol] === 'number')
                .map(d => ({ x: d[xCol], y: d[yCol] })),
            backgroundColor: `hsl(${i * 360 / yCols.length}, 70%, 50%)`
        }));
        if (!config.data.datasets.some(ds => ds.data.length)) return alert('No valid numeric data for scatter');
        config.options.scales.x = { type: 'linear' };
    } else if (type === 'histogram') {
        const yCol = yCols[0];
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
            datasets: yCols.map((yCol, i) => ({
                label: yCol,
                data: groups.map(group => 
                    csvData.filter(d => d[groupCol] === group).map(d => d[yCol]).filter(v => typeof v === 'number')
                ),
                backgroundColor: `hsl(${i * 360 / yCols.length}, 70%, 50%)`,
                borderColor: `hsl(${i * 360 / yCols.length}, 70%, 30%)`,
                outlierColor: '#999999'
            }))
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

function clearChart() {
    if (chart) {
        chart.destroy();
        chart = null;
    }
    document.getElementById('chartContainer').style.display = 'none';
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